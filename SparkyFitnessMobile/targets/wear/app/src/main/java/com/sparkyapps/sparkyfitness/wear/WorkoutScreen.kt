package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
internal fun WorkoutScreen(context: Context, screen: WearScreen?, bpm: Int) {
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
      modifier = Modifier
        .fillMaxSize()
        .verticalScroll(rememberScrollState())
        .padding(horizontal = 10.dp, vertical = 16.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
      when {
        screen == null -> Text(
          text = "Start a workout on your phone",
          color = Color.Gray,
          textAlign = TextAlign.Center,
          fontSize = 14.sp,
        )
        WorkoutHolder.listing -> ExerciseList(context)
        screen.finished -> {
          Text(text = "Workout done", color = Color.White, fontSize = 16.sp)
          if (bpm > 0) Bpm(bpm)
          if (WearHeartRate.kcal >= 0) Kcal(WearHeartRate.kcal)
          Chip(label = { Text("Finish") }, onClick = { WorkoutHolder.finish(context) })
        }
        resting -> {
          val left = ((restEndsAt - now) / 1000).toInt().coerceAtLeast(0)
          Text(text = "Rest", color = Color.Gray, fontSize = 12.sp)
          Text(text = "%d:%02d".format(left / 60, left % 60), color = Color.White, fontSize = 28.sp)
          if (bpm > 0) Bpm(bpm)
          if (WearHeartRate.kcal >= 0) Kcal(WearHeartRate.kcal)
          Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Chip(label = { Text("-15") }, onClick = { WorkoutHolder.adjustRest(context, -15) })
            Chip(label = { Text("+15") }, onClick = { WorkoutHolder.adjustRest(context, 15) })
          }
          Chip(label = { Text("Skip") }, onClick = { WorkoutHolder.skipRest(context) })
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
          Text(text = setLine(screen), color = Color.White, fontSize = 20.sp)
          if (bpm > 0) Bpm(bpm)
          if (WearHeartRate.kcal >= 0) Kcal(WearHeartRate.kcal)
          val kgStep = WatchContext.toKg(1.0)
          Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Chip(label = { Text("−kg") }, onClick = { WorkoutHolder.nudge(-kgStep, 0.0) })
            Chip(label = { Text("+kg") }, onClick = { WorkoutHolder.nudge(kgStep, 0.0) })
          }
          Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Chip(label = { Text("−rep") }, onClick = { WorkoutHolder.nudge(0.0, -1.0) })
            Chip(label = { Text("+rep") }, onClick = { WorkoutHolder.nudge(0.0, 1.0) })
          }
          Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Chip(label = { Text("<") }, onClick = { WorkoutHolder.previous() })
            Chip(label = { Text("Done") }, onClick = { WorkoutHolder.complete(context) })
            Chip(label = { Text(">") }, onClick = { WorkoutHolder.nextStep() })
          }
          Chip(label = { Text("Exercises") }, onClick = { WorkoutHolder.showExercises(true) })
        }
      }
    }
  }
}

@Composable
private fun ExerciseList(context: Context) {
  Text("Exercises", color = Color.Gray, fontSize = 12.sp)
  WorkoutHolder.exercises().forEach { exercise ->
    Chip(
      label = { Text("${exercise.name} ${exercise.done}/${exercise.total}") },
      onClick = { WorkoutHolder.jumpTo(exercise.id) },
    )
  }
  Chip(label = { Text("Finish workout") }, onClick = { WorkoutHolder.finish(context) })
  Chip(label = { Text("Back") }, onClick = { WorkoutHolder.showExercises(false) })
}

@Composable
private fun Bpm(bpm: Int) {
  Text(text = "$bpm bpm", color = Color.Gray, fontSize = 12.sp)
}

@Composable
private fun Kcal(kcal: Int) {
  Text(text = "$kcal kcal", color = Color.Gray, fontSize = 12.sp)
}

private fun setLine(screen: WearScreen): String {
  val unit = WatchContext.snapshot.unit.ifEmpty { "kg" }
  val weight = screen.weightKg?.let { WatchContext.displayWeight(it) }
  val weightText = if (weight == null) "–" else formatNumber(weight)
  val repsText = formatNumber(screen.reps)
  return "$weightText $unit × $repsText"
}

private fun formatNumber(value: Double?): String {
  if (value == null) return "–"
  return if (value % 1.0 == 0.0) value.toInt().toString() else String.format("%.1f", value)
}
