package com.sparkyapps.sparkyfitness.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent

/**
 * First Wear OS screen: the set the phone armed, and a Done button that
 * logs it. Check-in, water and heart rate are still Apple Watch only.
 */
class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WorkoutHolder.pull(this)
    setContent {
      WorkoutScreen(WorkoutHolder.screen) {
        WorkoutHolder.complete(this)
      }
    }
  }
}
