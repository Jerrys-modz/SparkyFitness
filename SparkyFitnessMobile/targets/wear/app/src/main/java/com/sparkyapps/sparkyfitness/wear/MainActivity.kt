package com.sparkyapps.sparkyfitness.wear

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState

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
    val screenshot = intent.getStringExtra("sparky.screenshot") == "1"
    if (screenshot) {
      ScreenshotSeed.apply(intent)
    } else {
      WorkoutHolder.pull(this)
      PhoneBus.requestContext(this)
    }
    val forcedPage = if (screenshot) screenshotPage(intent.getStringExtra("sparky.page")) else null
    setContent {
      val pager = rememberPagerState(initialPage = forcedPage ?: 2) { 5 }
      var landed by remember { mutableStateOf(forcedPage != null) }
      LaunchedEffect(WatchContext.snapshot.today) {
        if (landed || WatchContext.snapshot.today.isEmpty()) return@LaunchedEffect
        landed = true
        val page = if (WatchContext.snapshot.todayWeightKg != null) 0 else 2
        if (pager.currentPage != page) pager.scrollToPage(page)
      }
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

  private fun screenshotPage(name: String?): Int? = when (name) {
    "goals" -> 0
    "water" -> 1
    "entry", "checkin" -> 2
    "trend" -> 3
    "workout" -> 4
    else -> null
  }
}
