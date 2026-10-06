package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

@Composable
internal fun GoalsPage() {
  val snap = WatchContext.snapshot
  Page {
    Text("Goals", color = Color.Gray, fontSize = 12.sp)
    if (snap.caloriesRemaining == null && snap.caloriesConsumed == null) {
      Text(
        "Open Sparky on your phone to sync today.",
        color = Color.Gray,
        fontSize = 12.sp,
        textAlign = TextAlign.Center,
      )
    } else {
      Text("${snap.caloriesRemaining ?: 0}", color = Color.White, fontSize = 28.sp)
      Text("left", color = Color.Gray, fontSize = 12.sp)
      Text("Eaten ${snap.caloriesConsumed ?: 0}  Burned ${snap.caloriesBurned ?: 0}", color = Color.White, fontSize = 11.sp)
      Macro("Protein", snap.proteinConsumed, snap.proteinGoal)
      Macro("Carbs", snap.carbsConsumed, snap.carbsGoal)
      Macro("Fat", snap.fatConsumed, snap.fatGoal)
    }
  }
}

@Composable
private fun Macro(name: String, eaten: Int?, goal: Int?) {
  Text("$name  ${eaten ?: 0} / ${goal ?: 0} g", color = Color.White, fontSize = 12.sp)
}

@Composable
internal fun WaterPage(context: Context) {
  val snap = WatchContext.snapshot
  val pendingMl = WatchContext.pending.sumOf { it.ml }
  val ml = snap.waterMl + pendingMl
  Page {
    Text("Water", color = Color.Gray, fontSize = 12.sp)
    Text(formatWater(ml, snap.waterUnit), color = Color.White, fontSize = 22.sp)
    if (snap.waterGoalMl > 0) {
      val pct = ((ml / snap.waterGoalMl) * 100).toInt().coerceIn(0, 999)
      Text("$pct% of ${formatWater(snap.waterGoalMl, snap.waterUnit)}", color = Color.Gray, fontSize = 11.sp)
    }
    if (snap.containers.isEmpty()) {
      Text("No bottles synced yet.", color = Color.Gray, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
    snap.containers.forEach { container ->
      Chip(
        label = { Text(container.name) },
        onClick = { PhoneBus.water(context, container) },
      )
    }
    snap.drinks.take(8).forEach { drink ->
      Chip(
        label = { Text("${drink.name} ${formatWater(drink.volumeMl, snap.waterUnit)}") },
        onClick = { PhoneBus.deleteDrink(context, drink.id) },
      )
    }
  }
}

@Composable
internal fun CheckInPage(context: Context) {
  val snap = WatchContext.snapshot
  var weight by remember(snap.today, snap.lastWeightKg, snap.todayWeightKg) {
    mutableDoubleStateOf(WatchContext.displayWeight(WatchContext.seedWeightKg()))
  }
  var fat by remember(snap.lastBodyFat, snap.todayBodyFat) {
    mutableDoubleStateOf(snap.todayBodyFat ?: snap.lastBodyFat ?: 20.0)
  }
  var includeFat by remember(snap.lastBodyFat, snap.todayBodyFat) {
    mutableStateOf(snap.todayBodyFat != null || snap.lastBodyFat != null)
  }
  val step = if (snap.unit == "lbs") 0.2 else 0.1
  Page {
    Text("Check-in", color = Color.Gray, fontSize = 12.sp)
    Stepper(
      label = "${formatOne(weight)} ${snap.unit}",
      onMinus = { weight = (weight - step).coerceAtLeast(0.0) },
      onPlus = { weight += step },
    )
    Chip(
      label = { Text(if (includeFat) "Body fat ${formatOne(fat)}%" else "Add body fat") },
      onClick = { includeFat = !includeFat },
    )
    if (includeFat) {
      Stepper(
        label = "${formatOne(fat)}%",
        onMinus = { fat = (fat - 0.1).coerceAtLeast(0.0) },
        onPlus = { fat = (fat + 0.1).coerceAtMost(100.0) },
      )
    }
    Chip(
      label = { Text("Save") },
      onClick = {
        PhoneBus.checkIn(context, WatchContext.toKg(weight), if (includeFat) fat else null)
      },
    )
  }
}

@Composable
internal fun TrendPage() {
  val points = WatchContext.snapshot.history
  Page {
    Text("Weight", color = Color.Gray, fontSize = 12.sp)
    if (points.size < 2) {
      Text("Log a few days to see the trend.", color = Color.Gray, fontSize = 12.sp, textAlign = TextAlign.Center)
    } else {
      Canvas(Modifier.fillMaxWidth().height(72.dp)) {
        val min = points.minOf { it.second }
        val max = points.maxOf { it.second }.let { if (it == min) it + 1 else it }
        val stepX = size.width / (points.size - 1)
        points.forEachIndexed { index, point ->
          if (index == 0) return@forEachIndexed
          val previous = points[index - 1]
          drawLine(
            color = Color(0xFFFF9F0A),
            start = Offset(stepX * (index - 1), y(previous.second, min, max, size.height)),
            end = Offset(stepX * index, y(point.second, min, max, size.height)),
            strokeWidth = 4f,
            cap = StrokeCap.Round,
          )
        }
      }
      val last = points.last()
      Text(
        "${last.first}  ${formatOne(WatchContext.displayWeight(last.second))} ${WatchContext.snapshot.unit}",
        color = Color.White,
        fontSize = 12.sp,
      )
    }
  }
}

@Composable
private fun Stepper(label: String, onMinus: () -> Unit, onPlus: () -> Unit) {
  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    Chip(label = { Text("−") }, onClick = onMinus)
    Text(label, color = Color.White, fontSize = 16.sp)
    Chip(label = { Text("+") }, onClick = onPlus)
  }
}

@Composable
private fun Page(content: @Composable () -> Unit) {
  MaterialTheme {
    Column(
      Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 20.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      content()
    }
  }
}

private fun y(value: Double, min: Double, max: Double, height: Float): Float {
  val fraction = ((value - min) / (max - min)).toFloat()
  return height - fraction * height
}

private fun formatOne(value: Double): String =
  if (value % 1.0 == 0.0) value.toInt().toString() else String.format("%.1f", value)

private fun formatWater(ml: Double, unit: String): String = when (unit) {
  "oz" -> "${formatOne(ml / 29.5735)} oz"
  "liter" -> "${formatOne(ml / 1000.0)} L"
  else -> "${ml.toInt()} ml"
}
