package com.sparkyapps.sparkyfitness.wear

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect

/** The set the phone armed, and the heart rate measured while it is on screen. */
class MainActivity : ComponentActivity() {
  private val sensorPermission = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { granted ->
    WearHeartRate.onPermissionResult(this, granted)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WorkoutHolder.bind(this)
    WorkoutHolder.pull(this)
    setContent {
      LaunchedEffect(WearHeartRate.permissionNeeded) {
        if (WearHeartRate.permissionNeeded) {
          sensorPermission.launch(Manifest.permission.BODY_SENSORS)
        }
      }
      WorkoutScreen(WorkoutHolder.screen, WearHeartRate.bpm) {
        WorkoutHolder.complete(this)
      }
    }
  }
}
