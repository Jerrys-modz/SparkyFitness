package com.sparkyapps.sparkyfitness.backgroundwater

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Target of the "Log water" launcher shortcut. Has no UI: it hands the POST to
 * WorkManager and finishes at once, so the app never comes to the front and
 * the request is not dropped when this activity is gone.
 */
class LogWaterActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enqueueLogWater(applicationContext)
        finish()
    }
}

/**
 * Logs one drink in the background and reports how it went. Shared by the
 * launcher shortcut and, with [fromTile], the Quick Settings tile
 * (targets/android-widget).
 */
fun enqueueLogWater(context: Context, fromTile: Boolean = false) {
    try {
        val requestBuilder = OneTimeWorkRequestBuilder<LogWaterWorker>()
            .setInputData(workDataOf(KEY_FROM_TILE to fromTile))
        // Before Android 12 an expedited job runs as a foreground service,
        // and this worker does not supply ForegroundInfo.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestBuilder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        }
        val request = requestBuilder.build()
        WorkManager.getInstance(context).enqueue(request)
    } catch (e: Exception) {
        report(context, LogWaterResult(false, "SparkyFitness could not log the water"), fromTile)
    }
}

/** Owns the POST that [enqueueLogWater] queued, after its caller has gone. */
class LogWaterWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        report(applicationContext, logWater(applicationContext), inputData.getBoolean(KEY_FROM_TILE, false))
        return Result.success()
    }
}

private const val KEY_FROM_TILE = "from_tile"
private const val CHANNEL_ID = "quick-logging"
private const val LOGGED_NOTIFICATION_ID = 7301
private const val FAILED_NOTIFICATION_ID = 7302
private const val LOGGED_SHOWN_FOR_MS = 30_000L

private class LogWaterResult(val logged: Boolean, val message: String)

/**
 * The shortcut is tapped on the home screen, so a Toast is enough. Over the
 * tile a Toast would be drawn under the open panel or hidden by the lock
 * screen, so the tile's result goes to the notification list instead. Unless
 * the app is on screen, either way needs the app's notifications on: Android
 * drops a Toast from an app in the background while they are off.
 */
private fun report(context: Context, result: LogWaterResult, fromTile: Boolean) {
    // A logged drink, from either side, answers the tile's last failure.
    if (result.logged) NotificationManagerCompat.from(context).cancel(FAILED_NOTIFICATION_ID)
    if (!fromTile || !notify(context, result)) toast(context, result.message)
}

/**
 * Lists [result] without sound, vibration or a heads-up pop-up, since it only
 * confirms a tap; tapping it opens the app. A logged drink goes away after 30
 * seconds, a failure stays until a drink is logged or the tile fails again.
 * A lock screen that hides sensitive content shows a logged drink's public
 * version, which does not name the container; a failure never names it, so it
 * stays readable there. False when the app's notifications are off. A user who turned off just this
 * channel gets nothing.
 */
private fun notify(context: Context, result: LogWaterResult): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    return try {
        manager.createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_DEFAULT)
                .setName("Quick logging")
                .setSound(null, null)
                .setVibrationEnabled(false)
                .build(),
        )
        // The tile's own icon (targets/android-widget), looked up by name like
        // the shortcut's because R's package differs between builds.
        val icon = context.resources.getIdentifier("ic_tile_log_water", "drawable", context.packageName)
        val smallIcon = if (icon != 0) icon else context.applicationInfo.icon
        val builder = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIcon)
            .setContentText(result.message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(result.message))
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
        if (result.logged) {
            builder.setTimeoutAfter(LOGGED_SHOWN_FOR_MS)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(
                    NotificationCompat.Builder(context, CHANNEL_ID)
                        .setSmallIcon(smallIcon)
                        .setContentText("Water logged")
                        .build(),
                )
        } else {
            builder.setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        }
        context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            builder.setContentIntent(PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE))
        }
        // Two ids, because on many Android versions a logged drink's timeout
        // would also remove a failure posted under the same id.
        if (!result.logged) manager.cancel(LOGGED_NOTIFICATION_ID)
        manager.notify(if (result.logged) LOGGED_NOTIFICATION_ID else FAILED_NOTIFICATION_ID, builder.build())
        true
    } catch (e: SecurityException) {
        // The permission was taken back after the check above.
        false
    }
}

private fun logWater(context: Context): LogWaterResult {
    return try {
        val json = BackgroundWaterStore.load(context)
            ?: return LogWaterResult(false, "Open SparkyFitness and sign in to a server first.")
        val config = JSONObject(json)
        if (config.isNull("containerId") || config.isNull("containerName")) {
            return LogWaterResult(false, "Pick a water container in SparkyFitness first.")
        }
        val baseUrl = config.getString("baseUrl")
        val containerName = config.getString("containerName")
        val volume = config.optString("volumeLabel", "")
        val body = JSONObject()
            .put("entry_date", SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()))
            .put("change_drinks", 1)
            .put("container_id", config.getInt("containerId"))

        val connection = URL("$baseUrl/api/measurements/water-intake").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            // A redirect would resend the configured headers (a proxy credential
            // can live in one) to another host; a 3xx fails below instead.
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            val headers = config.getJSONObject("headers")
            for (name in headers.keys()) {
                connection.setRequestProperty(name, headers.getString(name))
            }
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            when {
                status in 200..299 -> {
                    val what = if (volume.isNotEmpty()) "$containerName ($volume)" else containerName
                    LogWaterResult(true, "Logged 1 × $what")
                }
                status == 401 || status == 403 ->
                    LogWaterResult(false, "Your SparkyFitness login expired. Open the app once to sign in again.")
                else -> LogWaterResult(false, "SparkyFitness could not log the water (error $status)")
            }
        } finally {
            connection.disconnect()
        }
    } catch (e: Exception) {
        LogWaterResult(false, "SparkyFitness could not reach your server")
    }
}

private fun toast(context: Context, message: String) {
    Handler(Looper.getMainLooper()).post {
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
    }
}
