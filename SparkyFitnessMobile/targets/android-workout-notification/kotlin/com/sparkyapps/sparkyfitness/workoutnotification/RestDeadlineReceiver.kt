package com.sparkyapps.sparkyfitness.workoutnotification

import android.app.NotificationManager
import android.app.Notification
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.sparkyapps.sparkyfitness.workoutnotification.WorkoutNotificationModule.Companion.NOTIFICATION_ID

/** Clears the expired countdown even when the React Native process is asleep. */
class RestDeadlineReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val expected = intent.getLongExtra("restEndsAt", 0L)
        val stored = context.getSharedPreferences("workout-notification", Context.MODE_PRIVATE)
            .getLong("restEndsAt", 0L)
        if (expected == 0L || expected != stored || System.currentTimeMillis() < expected) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = manager.activeNotifications
            .firstOrNull { it.id == NOTIFICATION_ID }?.notification ?: return
        val startedAt = context.getSharedPreferences("workout-notification", Context.MODE_PRIVATE)
            .getLong("startedAt", 0L)
        val resumed = Notification.Builder.recoverBuilder(context, notification)
            .setWhen(startedAt)
            .setChronometerCountDown(false)
            .build()
        manager.notify(NOTIFICATION_ID, resumed)
        context.getSharedPreferences("workout-notification", Context.MODE_PRIVATE)
            .edit().remove("restEndsAt").remove("startedAt").apply()
    }
}
