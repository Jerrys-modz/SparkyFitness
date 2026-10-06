package com.sparkyapps.sparkyfitness.wear

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay

@Composable
internal fun WorkoutScreen(screen: WearScreen?, onDone: () -> Unit) {
  var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
  val restEndsAt = screen?.restEndsAtMs ?: 0L
  LaunchedEffect(restEndsAt) {
    while (restEndsAt > System.currentTimeMillis()) {
      now = System.currentTimeMillis()
      delay(1000)
    }
    now = System.currentTimeMillis()
  }
  val resting = restEndsAt > now
  MaterialTheme {
    Column(
      modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 20.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center,
    ) {
      when {
        screen == null -> Text(
          text = "Start a workout on your phone",
          color = Color.Gray,
          textAlign = TextAlign.Center,
          fontSize = 14.sp,
        )
        screen.finished -> Text(
          text = "Workout done",
          color = Color.White,
          fontSize = 16.sp,
        )
        resting -> {
          val left = ((restEndsAt - now) / 1000).toInt().coerceAtLeast(0)
          Text(text = "Rest", color = Color.Gray, fontSize = 12.sp)
          Text(
            text = "%d:%02d".format(left / 60, left % 60),
            color = Color.White,
            fontSize = 28.sp,
          )
        }
        else -> {
          Text(
            text = screen.exerciseName,
            color = Color.White,
            fontSize = 16.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
          )
          Text(text = screen.label, color = Color(0xFFFF9F0A), fontSize = 12.sp)
          Text(
            text = "${screen.weightText} kg × ${screen.repsText}",
            color = Color.White,
            fontSize = 22.sp,
          )
          Chip(label = { Text("Done") }, onClick = onDone)
        }
      }
    }
  }
}
