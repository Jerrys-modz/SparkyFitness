package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay

private enum class EditField { WEIGHT, REPS }

@Composable
internal fun WorkoutScreen(context: Context, screen: WearScreen?, bpm: Int, page: Int) {
  var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
  var editing by remember { mutableStateOf<EditField?>(null) }
  LaunchedEffect(screen != null) {
    if (screen == null) return@LaunchedEffect
    while (true) {
      now = System.currentTimeMillis()
      delay(1000)
    }
  }
  val restEndsAt = screen?.restEndsAtMs ?: 0L
  val resting = restEndsAt > now
  WatchFrame(page) {
    when {
      editing != null && screen != null -> Keypad(
        field = editing!!,
        initial = if (editing == EditField.WEIGHT) {
          screen.weightKg?.let { WatchContext.displayWeight(it) }
        } else {
          screen.reps
        },
        onDismiss = { editing = null },
        onCommit = { value ->
          if (editing == EditField.WEIGHT) WorkoutHolder.setField(WatchContext.toKg(value), null)
          else WorkoutHolder.setField(null, value)
          editing = null
        },
      )
      screen == null -> Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
      ) {
        BarbellIcon(Modifier.size(44.dp))
        Text(
          "Start a workout on your phone",
          color = Palette.secondary,
          fontSize = 13.sp,
          textAlign = TextAlign.Center,
          modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        )
      }
      WorkoutHolder.listing -> ExerciseList(context)
      screen.finished -> Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
      ) {
        Text("Workout complete", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Metrics(bpm, WearHeartRate.kcal, elapsed(now), onList = null)
        ActionCapsule("Finish", Palette.green) { WorkoutHolder.finish(context) }
      }
      resting -> Resting(context, screen, bpm, now)
      else -> ActiveSet(context, screen, bpm, now) { editing = it }
    }
  }
}

@Composable
private fun ActiveSet(
  context: Context,
  screen: WearScreen,
  bpm: Int,
  now: Long,
  onEdit: (EditField) -> Unit,
) {
  val unit = WatchContext.snapshot.unit.ifEmpty { "kg" }
  Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(3.dp)) {
    Metrics(bpm, WearHeartRate.kcal, elapsed(now)) { WorkoutHolder.showExercises(true) }
    Text(
      screen.exerciseName,
      color = Color.White,
      fontSize = 14.sp,
      fontWeight = FontWeight.SemiBold,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
    )
    if (!screen.superset.isNullOrEmpty()) {
      Text(
        "Superset · ${screen.superset}",
        color = supersetColor(screen.supersetRun),
        fontSize = 9.sp,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
    Text(screen.label, color = Palette.orange, fontSize = 11.sp, maxLines = 1)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
      ValueBox(
        formatNumber(screen.weightKg?.let { WatchContext.displayWeight(it) }),
        if (unit == "lbs") "LB" else "KG",
        Modifier.weight(1f),
      ) { onEdit(EditField.WEIGHT) }
      ValueBox(formatNumber(screen.reps), "REPS", Modifier.weight(1f)) { onEdit(EditField.REPS) }
    }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Chevron("<") { WorkoutHolder.previous() }
      Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
        Box(
          Modifier
            .width(52.dp)
            .height(28.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Palette.green)
            .clickable { WorkoutHolder.complete(context) },
          contentAlignment = Alignment.Center,
        ) {
          Text("✓", color = Color.Black, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
      }
      Chevron(">") { WorkoutHolder.nextStep() }
    }
  }
}

@Composable
private fun Resting(context: Context, screen: WearScreen, bpm: Int, now: Long) {
  val left = ((screen.restEndsAtMs - now) / 1000).toInt().coerceAtLeast(0)
  val total = screen.restTotalMs.coerceAtLeast(1L)
  val progress = (1f - (left * 1000f / total)).coerceIn(0f, 1f)
  val unit = WatchContext.snapshot.unit.ifEmpty { "kg" }
  Column(
    Modifier.fillMaxSize(),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(2.dp),
  ) {
    Metrics(bpm, WearHeartRate.kcal, elapsed(now)) { WorkoutHolder.showExercises(true) }
    Text(
      "Skip",
      color = Palette.blue,
      fontSize = 12.sp,
      modifier = Modifier
        .align(Alignment.Start)
        .clickable { WorkoutHolder.skipRest(context) },
    )
    Text("%d:%02d".format(left / 60, left % 60), color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
    Box(
      Modifier
        .fillMaxWidth()
        .height(6.dp)
        .clip(RoundedCornerShape(3.dp))
        .background(Palette.secondary.copy(alpha = 0.3f)),
    ) {
      Box(Modifier.fillMaxHeight().fillMaxWidth(progress).background(Palette.blue))
    }
    Text(
      if (screen.superset.isNullOrEmpty()) "Next set" else "Next in superset",
      color = if (screen.superset.isNullOrEmpty()) Palette.secondary else supersetColor(screen.supersetRun),
      fontSize = 9.sp,
    )
    Text(screen.exerciseName, color = Color.White, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Text(nextLine(screen, unit), color = Palette.secondary, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
      RestButton("-15s", Modifier.weight(1f)) { WorkoutHolder.adjustRest(context, -15) }
      RestButton("+15s", Modifier.weight(1f)) { WorkoutHolder.adjustRest(context, 15) }
    }
  }
}

@Composable
private fun ExerciseList(context: Context) {
  val rows = WorkoutHolder.exercises()
  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Box(
        Modifier
          .size(22.dp)
          .clip(CircleShape)
          .background(Palette.card)
          .clickable { WorkoutHolder.showExercises(false) },
        contentAlignment = Alignment.Center,
      ) { Text("×", color = Color.White, fontSize = 14.sp) }
    }
    Text(
      "${rows.size} Exercises",
      color = Palette.secondary,
      fontSize = 11.sp,
      modifier = Modifier.padding(top = 4.dp, bottom = 2.dp),
    )
    exerciseBlocks(rows).forEach { block ->
      val bar = block.run?.let { supersetColor(it) }
      if (bar != null) {
        Text("Superset", color = bar, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
      }
      block.rows.forEach { exercise -> ExerciseCard(exercise, bar) }
    }
    Text(
      "Finish workout",
      color = Palette.red,
      fontSize = 12.sp,
      modifier = Modifier
        .padding(top = 8.dp, bottom = 4.dp)
        .clickable { WorkoutHolder.finish(context) },
    )
  }
}

@Composable
private fun ExerciseCard(exercise: ExerciseRow, bar: Color?) {
  Row(
    Modifier
      .fillMaxWidth()
      .padding(top = 4.dp)
      .height(IntrinsicSize.Min)
      .clip(RoundedCornerShape(12.dp))
      .background(Palette.card)
      .clickable { WorkoutHolder.jumpTo(exercise.id) },
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (bar != null) {
      Box(Modifier.width(3.dp).fillMaxHeight().background(bar))
    }
    Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) {
      Text(exercise.name, color = Color.White, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
      Text(
        if (exercise.done == 0) "${exercise.total} Sets" else "${exercise.done}/${exercise.total} Sets",
        color = Palette.secondary,
        fontSize = 10.sp,
      )
    }
  }
}

private data class ExerciseBlock(val run: Int?, val rows: List<ExerciseRow>)

private fun exerciseBlocks(rows: List<ExerciseRow>): List<ExerciseBlock> {
  val blocks = mutableListOf<ExerciseBlock>()
  rows.forEach { row ->
    val last = blocks.lastOrNull()
    if (row.supersetRun != null && last?.run == row.supersetRun) {
      blocks[blocks.lastIndex] = last.copy(rows = last.rows + row)
    } else if (row.supersetRun == null && last?.run == null && last != null) {
      blocks[blocks.lastIndex] = last.copy(rows = last.rows + row)
    } else {
      blocks += ExerciseBlock(row.supersetRun, listOf(row))
    }
  }
  return blocks
}

private fun supersetColor(run: Int?): Color {
  if (run == null) return Palette.blue
  return Palette.superset[kotlin.math.abs(run) % Palette.superset.size]
}

@Composable
private fun Keypad(field: EditField, initial: Double?, onDismiss: () -> Unit, onCommit: (Double) -> Unit) {
  var entry by remember(field) { mutableStateOf(formatNumber(initial).let { if (it == "–") "" else it }) }
  val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", if (field == EditField.WEIGHT) "." else "", "0", "⌫")
  Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Text("×", color = Palette.secondary, fontSize = 14.sp, modifier = Modifier.clickable(onClick = onDismiss))
      Text(
        if (field == EditField.WEIGHT) "KG" else "REPS",
        color = Palette.secondary,
        fontSize = 11.sp,
        modifier = Modifier.weight(1f),
        textAlign = TextAlign.Center,
      )
      Text("✓", color = Palette.green, fontSize = 16.sp, modifier = Modifier.clickable {
        entry.toDoubleOrNull()?.let(onCommit) ?: onDismiss()
      })
    }
    Text(entry.ifEmpty { "0" }, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
    keys.chunked(3).forEach { row ->
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        row.forEach { key ->
          Box(
            Modifier.size(28.dp).clip(RoundedCornerShape(6.dp)).background(Palette.card).clickable {
              entry = when (key) {
                "" -> entry
                "⌫" -> entry.dropLast(1)
                "." -> if (entry.contains('.')) entry else entry + "."
                else -> entry + key
              }
            },
            contentAlignment = Alignment.Center,
          ) {
            Text(key, color = Color.White, fontSize = 13.sp)
          }
        }
      }
    }
  }
}

@Composable
private fun Metrics(bpm: Int, kcal: Int, elapsed: String, expand: Boolean = true, onList: (() -> Unit)? = null) {
  Row(
    if (expand) Modifier.fillMaxWidth() else Modifier,
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(3.dp),
  ) {
    if (onList != null) {
      Text("<", color = Palette.blue, fontSize = 14.sp, modifier = Modifier.clickable(onClick = onList))
    }
    if (kcal >= 0) {
      FlameIcon(Modifier.size(10.dp))
      Text("$kcal", color = Palette.orange, fontSize = 11.sp)
    }
    Text(elapsed, color = Palette.secondary, fontSize = 11.sp)
    if (expand) Box(Modifier.weight(1f))
    if (bpm > 0) {
      HeartIcon(Palette.red, Modifier.size(10.dp))
      Text("$bpm", color = Palette.red, fontSize = 11.sp)
    }
  }
}

@Composable
private fun ValueBox(value: String, unit: String, modifier: Modifier, onClick: () -> Unit) {
  Column(
    modifier
      .clip(RoundedCornerShape(8.dp))
      .background(Palette.card)
      .clickable(onClick = onClick)
      .padding(vertical = 4.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(value, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    Text(unit, color = Palette.secondary, fontSize = 9.sp)
  }
}

@Composable
private fun Chevron(label: String, onClick: () -> Unit) {
  Text(label, color = Palette.secondary, fontSize = 16.sp, modifier = Modifier.clickable(onClick = onClick).padding(4.dp))
}

@Composable
private fun RestButton(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
  Box(
    modifier
      .clip(RoundedCornerShape(14.dp))
      .background(Palette.card)
      .clickable(onClick = onClick)
      .padding(vertical = 6.dp),
    contentAlignment = Alignment.Center,
  ) {
    Text(label, color = Color.White, fontSize = 12.sp)
  }
}

@Composable
private fun ActionCapsule(label: String, color: Color, onClick: () -> Unit) {
  Box(
    Modifier
      .padding(top = 8.dp)
      .clip(RoundedCornerShape(16.dp))
      .background(color)
      .clickable(onClick = onClick)
      .padding(horizontal = 18.dp, vertical = 6.dp),
  ) {
    Text(label, color = Color.Black, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
  }
}

private fun elapsed(now: Long): String {
  val seconds = ((now - startedAt()) / 1000).toInt().coerceAtLeast(0)
  return "%d:%02d".format(seconds / 60, seconds % 60)
}

private fun startedAt(): Long = WorkoutHolder.workoutStartedAt().takeIf { it > 0L }
  ?: System.currentTimeMillis()

private fun nextLine(screen: WearScreen, unit: String): String {
  val weight = screen.weightKg?.let { formatNumber(WatchContext.displayWeight(it)) }
  val reps = formatNumber(screen.reps)
  val load = if (weight == null || weight == "–") "$reps reps" else "$weight$unit × $reps"
  return "${screen.label} · $load"
}

private fun formatNumber(value: Double?): String {
  if (value == null) return "–"
  return if (value % 1.0 == 0.0) value.toInt().toString() else String.format("%.1f", value)
}
