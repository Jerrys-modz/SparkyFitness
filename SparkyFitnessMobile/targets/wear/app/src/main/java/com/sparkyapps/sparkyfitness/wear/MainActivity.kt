package com.sparkyapps.sparkyfitness.wear

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.wear.compose.foundation.pager.HorizontalPager
import androidx.wear.compose.foundation.pager.rememberPagerState

/** Goals, water, check-in, trend, and the live workout. Swipe between them. */
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
    PhoneBus.requestContext(this)
    setContent {
      val start = if (WatchContext.snapshot.todayWeightKg != null) 0 else 2
      val pager = rememberPagerState(initialPage = start) { 5 }
      LaunchedEffect(WearHeartRate.permissionNeeded) {
        if (WearHeartRate.permissionNeeded) {
          sensorPermission.launch(Manifest.permission.BODY_SENSORS)
        }
      }
      HorizontalPager(state = pager) { page ->
        when (page) {
          0 -> GoalsPage()
          1 -> WaterPage(this@MainActivity)
          2 -> CheckInPage(this@MainActivity)
          3 -> TrendPage()
          else -> WorkoutScreen(this@MainActivity, WorkoutHolder.screen, WearHeartRate.bpm)
        }
      }
    }
  }
}
