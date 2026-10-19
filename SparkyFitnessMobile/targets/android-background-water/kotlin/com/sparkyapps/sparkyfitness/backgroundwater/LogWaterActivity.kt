package com.sparkyapps.sparkyfitness.backgroundwater

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.quicksettings.TileService
import android.widget.Toast
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
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
 * Logs one drink in the background and reports the result, as a Toast and
 * through [LogWaterOutcome]. Shared by the launcher shortcut and the Quick
 * Settings tile (targets/android-widget).
 */
fun enqueueLogWater(context: Context) {
    try {
        val requestBuilder = OneTimeWorkRequestBuilder<LogWaterWorker>()
        // Before Android 12 an expedited job runs as a foreground service,
        // and this worker does not supply ForegroundInfo.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestBuilder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        }
        val request = requestBuilder.build()
        WorkManager.getInstance(context).enqueue(request)
    } catch (e: Exception) {
        val message = "SparkyFitness could not log the water"
        LogWaterOutcome.finished(context, message)
        toast(context, message)
    }
}

/** Owns the POST that [enqueueLogWater] queued, after its caller has gone. */
class LogWaterWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val message = logWater(applicationContext)
        LogWaterOutcome.finished(applicationContext, message)
        toast(applicationContext, message)
        return Result.success()
    }
}

/**
 * How the last log went, for the Quick Settings tile: a Toast is hidden behind
 * the open panel and the lock screen, so the tile shows this for a minute.
 */
object LogWaterOutcome {
    private const val PREFS = "sparky_background_water_outcome"
    private const val KEY_AT = "at"
    private const val KEY_MESSAGE = "message"
    private const val SHOWN_FOR_MS = 60_000L
    private const val TILE = "com.sparkyapps.sparkyfitness.widget.LogWaterTileService"

    /** A log was just asked for; [recent] reads "" until it has finished. */
    fun started(context: Context) = write(context, "")

    fun finished(context: Context, message: String) {
        write(context, message)
        try {
            // Draws the tile again if the panel is open.
            TileService.requestListeningState(context, ComponentName(context.packageName, TILE))
        } catch (e: Exception) {
            // The tile may not be in the panel at all.
        }
    }

    /** "" while a log is running, its message once done, null after a minute. */
    fun recent(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (System.currentTimeMillis() - prefs.getLong(KEY_AT, 0L) > SHOWN_FOR_MS) return null
        return prefs.getString(KEY_MESSAGE, null)
    }

    private fun write(context: Context, message: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(KEY_AT, System.currentTimeMillis())
            .putString(KEY_MESSAGE, message)
            .apply()
    }
}

private fun logWater(context: Context): String {
    return try {
        val json = BackgroundWaterStore.load(context)
            ?: return "Open SparkyFitness and sign in to a server first."
        val config = JSONObject(json)
        if (config.isNull("containerId") || config.isNull("containerName")) {
            return "Pick a water container in SparkyFitness first."
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
                    "Logged 1 × $what"
                }
                status == 401 || status == 403 ->
                    "Your SparkyFitness login expired. Open the app once to sign in again."
                else -> "SparkyFitness could not log the water (error $status)"
            }
        } finally {
            connection.disconnect()
        }
    } catch (e: Exception) {
        "SparkyFitness could not reach your server"
    }
}

private fun toast(context: Context, message: String) {
    Handler(Looper.getMainLooper()).post {
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
    }
}
