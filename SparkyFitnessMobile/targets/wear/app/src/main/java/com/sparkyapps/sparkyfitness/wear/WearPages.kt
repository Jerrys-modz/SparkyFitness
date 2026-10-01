package com.sparkyapps.sparkyfitness.wear

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text

@Composable
internal fun GoalsPage(page: Int) {
  val snap = WatchContext.snapshot
  val remaining = snap.caloriesRemaining
  val eaten = snap.caloriesConsumed ?: 0
  val goal = if (remaining == null) 0 else eaten - remaining
  val progress = if (goal <= 0) 0f else (eaten.toFloat() / goal).coerceIn(0f, 1f)
  WatchFrame(page, horizontal = 14.dp) {
    if (snap.caloriesRemaining == null && snap.caloriesConsumed == null) {
      Text(
        "Open Sparky on your phone to sync today.",
        color = Palette.secondary,
        fontSize = 12.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.align(Alignment.Center),
      )
    } else {
      Column(
        Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
      ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
          Stat(eaten.toString(), "Eaten", Modifier.weight(1f))
          Box(Modifier.size(58.dp), contentAlignment = Alignment.Center) {
            CalorieRing(progress, Modifier.fillMaxSize())
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
              Text(
                "${remaining ?: 0}",
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
              )
              Text(
                if ((remaining ?: 0) < 0) "Kcal over" else "Kcal left",
                color = Palette.secondary,
                fontSize = 8.sp,
                maxLines = 1,
              )
            }
          }
          Stat((snap.caloriesBurned ?: 0).toString(), "Burned", Modifier.weight(1f))
        }
        MacroRow("Protein", snap.proteinConsumed, snap.proteinGoal, Palette.protein)
        MacroRow("Carbs", snap.carbsConsumed, snap.carbsGoal, Palette.carbs)
        MacroRow("Fat", snap.fatConsumed, snap.fatGoal, Palette.fat)
      }
    }
  }
}

@Composable
private fun Stat(value: String, label: String, modifier: Modifier) {
  Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
    Text(value, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
    Text(label, color = Palette.secondary, fontSize = 8.sp, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
  }
}

@Composable
private fun MacroRow(name: String, eaten: Int?, goal: Int?, color: Color) {
  val progress = if (goal == null || goal <= 0) 0f else ((eaten ?: 0).toFloat() / goal).coerceIn(0f, 1f)
  Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
      Text(name, color = Color.White, fontSize = 12.sp, modifier = Modifier.weight(1f), maxLines = 1)
      Text("${eaten ?: 0}", color = color, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
      Text(" / ${goal ?: 0}g", color = Palette.secondary, fontSize = 11.sp)
    }
    Box(
      Modifier
        .fillMaxWidth()
        .height(5.dp)
        .clip(RoundedCornerShape(3.dp))
        .background(Palette.secondary.copy(alpha = 0.25f)),
    ) {
      Box(
        Modifier
          .fillMaxHeight()
          .fillMaxWidth(progress)
          .background(Brush.horizontalGradient(listOf(color.copy(alpha = 0.35f), color))),
      )
    }
  }
}

@Composable
internal fun WaterPage(context: Context, page: Int) {
  val snap = WatchContext.snapshot
  val pendingMl = WatchContext.pending.sumOf { it.ml }
  val ml = snap.waterMl + pendingMl
  val fraction = if (snap.waterGoalMl <= 0) 0f else (ml / snap.waterGoalMl).toFloat().coerceIn(0f, 1f)
  var showLog by remember { mutableStateOf(false) }
  WatchFrame(page, horizontal = 14.dp) {
    if (showLog) {
      Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Text(
            "×",
            color = Palette.secondary,
            fontSize = 14.sp,
            modifier = Modifier.clickable { showLog = false },
          )
          Text("Today", color = Palette.secondary, fontSize = 11.sp, modifier = Modifier.padding(start = 6.dp))
        }
        if (snap.drinks.isEmpty()) {
          Text("Nothing logged today.", color = Palette.secondary, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
        }
        snap.drinks.forEach { drink ->
          Column(Modifier.padding(top = 6.dp)) {
            Text(drink.name, color = Color.White, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
              "${formatWater(drink.volumeMl, snap.waterUnit)} · ${drink.time}",
              color = Palette.secondary,
              fontSize = 10.sp,
            )
          }
        }
      }
    } else {
      Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(
          Modifier.weight(1.7f).fillMaxHeight(),
          horizontalAlignment = Alignment.CenterHorizontally,
        ) {
          Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
              Modifier.size(12.dp).clip(CircleShape).background(Palette.green),
              contentAlignment = Alignment.Center,
            ) {
              Text("✓", color = Color.Black, fontSize = 8.sp, fontWeight = FontWeight.Bold)
            }
            val label = if (snap.waterGoalMl <= 0) "Water" else "${(fraction * 100).toInt()}% · ${formatWater(ml, snap.waterUnit)}"
            Text(
              label,
              color = Color.White,
              fontSize = 11.sp,
              fontWeight = FontWeight.SemiBold,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis,
              modifier = Modifier.padding(start = 3.dp),
            )
          }
          Bottle(
            fraction,
            Modifier
              .weight(1f)
              .fillMaxWidth()
              .padding(top = 2.dp),
          )
        }
        Column(
          Modifier.weight(1f).verticalScroll(rememberScrollState()),
          verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
          if (snap.containers.isEmpty()) {
            Text("No bottles yet", color = Palette.secondary, fontSize = 10.sp, textAlign = TextAlign.Center)
          }
          snap.containers.forEach { container ->
            WaterTile(
              container.name,
              formatWater(container.servingMl, snap.waterUnit),
              tinted = true,
            ) { PhoneBus.water(context, container) }
          }
          WaterTile("Log", null, tinted = false) { showLog = true }
        }
      }
    }
  }
}

@Composable
private fun WaterTile(title: String, detail: String?, tinted: Boolean, onClick: () -> Unit) {
  Column(
    Modifier
      .fillMaxWidth()
      .aspectRatio(1f)
      .clip(RoundedCornerShape(16.dp))
      .background(if (tinted) Palette.water.copy(alpha = 0.16f) else Palette.secondary.copy(alpha = 0.16f))
      .clickable(onClick = onClick)
      .padding(2.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center,
  ) {
    if (tinted) DropIcon(Modifier.size(12.dp)) else ListIcon(Modifier.size(12.dp))
    Text(title, color = Color.White, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    if (detail != null) {
      Text(detail, color = Palette.secondary, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }
}

@Composable
private fun DropIcon(modifier: Modifier) {
  Canvas(modifier) {
    val path = Path().apply {
      val w = size.width
      val h = size.height
      moveTo(w * 0.5f, h * 0.08f)
      cubicTo(w * 0.5f, h * 0.08f, w * 0.12f, h * 0.46f, w * 0.12f, h * 0.64f)
      cubicTo(w * 0.12f, h * 0.9f, w * 0.28f, h * 0.98f, w * 0.5f, h * 0.98f)
      cubicTo(w * 0.72f, h * 0.98f, w * 0.88f, h * 0.9f, w * 0.88f, h * 0.64f)
      cubicTo(w * 0.88f, h * 0.46f, w * 0.5f, h * 0.08f, w * 0.5f, h * 0.08f)
      close()
    }
    drawPath(path, Palette.water)
  }
}

@Composable
private fun ListIcon(modifier: Modifier) {
  Canvas(modifier) {
    val color = Palette.secondary
    val left = size.width * 0.15f
    val right = size.width * 0.85f
    listOf(0.28f, 0.5f, 0.72f).forEach { y ->
      drawLine(color, Offset(left, size.height * y), Offset(right, size.height * y), strokeWidth = 1.6f, cap = StrokeCap.Round)
    }
  }
}

@Composable
private fun Bottle(fraction: Float, modifier: Modifier) {
  Canvas(modifier.aspectRatio(70f / 130f, matchHeightConstraintsFirst = true)) {
    val path = bottlePath(size.width, size.height)
    drawPath(path, Palette.secondary.copy(alpha = 0.15f))
    clipPath(path) {
      val top = size.height * (1f - fraction.coerceIn(0f, 1f))
      drawRect(
        color = Palette.water,
        topLeft = Offset(0f, top),
        size = androidx.compose.ui.geometry.Size(size.width, size.height - top),
      )
    }
    drawPath(path, Palette.secondary.copy(alpha = 0.7f), style = Stroke(width = 1.5f))
  }
}

private fun bottlePath(width: Float, height: Float): Path {
  fun x(v: Float) = v / 70f * width
  fun y(v: Float) = v / 130f * height
  return Path().apply {
    moveTo(x(26f), y(6f))
    lineTo(x(26f), y(23f))
    lineTo(x(23f), y(23f))
    lineTo(x(23f), y(28f))
    cubicTo(x(23f), y(34f), x(12f), y(37f), x(12f), y(42f))
    lineTo(x(12f), y(112f))
    cubicTo(x(12f), y(121f), x(20f), y(124f), x(35f), y(124f))
    cubicTo(x(50f), y(124f), x(58f), y(121f), x(58f), y(112f))
    lineTo(x(58f), y(42f))
    cubicTo(x(58f), y(37f), x(47f), y(34f), x(47f), y(28f))
    lineTo(x(47f), y(23f))
    lineTo(x(44f), y(23f))
    lineTo(x(44f), y(6f))
    close()
  }
}

@Composable
internal fun CheckInPage(context: Context, page: Int) {
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
  var editingFat by remember { mutableStateOf(false) }
  val step = if (snap.unit == "lbs") 0.2 else 0.1
  val last = snap.lastWeightKg?.let { WatchContext.displayWeight(it) }
  val delta = if (last == null) null else weight - last
  WatchFrame(page, horizontal = 16.dp) {
    Column(
      Modifier.fillMaxSize(),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.SpaceEvenly,
    ) {
      Text("Check-in", color = Palette.secondary, fontSize = 11.sp)
      if (!editingFat) {
        StepperLine(
          value = formatOne(weight),
          unit = snap.unit,
          onMinus = { weight = (weight - step).coerceAtLeast(0.0) },
          onPlus = { weight += step },
        )
        Text(
          if (delta == null) " " else "${signed(delta)} ${snap.unit} since last",
          color = Palette.secondary,
          fontSize = 10.sp,
        )
      } else {
        StepperLine(
          value = formatOne(fat),
          unit = "%",
          onMinus = { fat = (fat - 0.1).coerceAtLeast(0.0) },
          onPlus = { fat = (fat + 0.1).coerceAtMost(100.0) },
        )
      }
      Text(
        if (includeFat) "Body fat ${formatOne(fat)}%" else "Add body fat",
        color = if (editingFat) Color.White else Palette.secondary,
        fontSize = 12.sp,
        modifier = Modifier.clickable {
          if (!includeFat) includeFat = true
          editingFat = !editingFat
        },
      )
      Box(
        Modifier
          .clip(RoundedCornerShape(16.dp))
          .background(Palette.green)
          .clickable {
            PhoneBus.checkIn(context, WatchContext.toKg(weight), if (includeFat) fat else null)
          }
          .padding(horizontal = 22.dp, vertical = 6.dp),
      ) {
        Text("Save", color = Color.Black, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
      }
    }
  }
}

@Composable
private fun StepperLine(value: String, unit: String, onMinus: () -> Unit, onPlus: () -> Unit) {
  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    RoundButton("−", onMinus)
    Row(verticalAlignment = Alignment.Bottom) {
      Text(value, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, softWrap = false)
      Text(" $unit", color = Palette.secondary, fontSize = 11.sp, modifier = Modifier.padding(bottom = 3.dp))
    }
    RoundButton("+", onPlus)
  }
}

@Composable
private fun RoundButton(label: String, onClick: () -> Unit) {
  Box(
    Modifier
      .size(28.dp)
      .clip(RoundedCornerShape(10.dp))
      .background(Palette.card)
      .clickable(onClick = onClick),
    contentAlignment = Alignment.Center,
  ) {
    Text(label, color = Color.White, fontSize = 16.sp)
  }
}

@Composable
internal fun TrendPage(page: Int) {
  val points = WatchContext.snapshot.history
  val unit = WatchContext.snapshot.unit
  WatchFrame(page) {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
      Text("Weight", color = Palette.secondary, fontSize = 11.sp)
      if (points.size < 2) {
        Text(
          "Log a few days to see the trend.",
          color = Palette.secondary,
          fontSize = 12.sp,
          textAlign = TextAlign.Center,
          modifier = Modifier.padding(top = 16.dp),
        )
      } else {
        val last = points.last()
        Text(
          "${formatOne(WatchContext.displayWeight(last.second))} $unit",
          color = Color.White,
          fontSize = 16.sp,
          fontWeight = FontWeight.SemiBold,
        )
        Canvas(Modifier.fillMaxWidth().weight(1f).padding(vertical = 4.dp)) {
          val min = points.minOf { it.second }
          val max = points.maxOf { it.second }.let { if (it == min) it + 1 else it }
          val stepX = size.width / (points.size - 1)
          points.forEachIndexed { index, point ->
            if (index == 0) return@forEachIndexed
            val previous = points[index - 1]
            drawLine(
              color = Palette.orange,
              start = Offset(stepX * (index - 1), trendY(previous.second, min, max, size.height)),
              end = Offset(stepX * index, trendY(point.second, min, max, size.height)),
              strokeWidth = 4f,
              cap = StrokeCap.Round,
            )
          }
        }
        Text(last.first, color = Palette.secondary, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
  }
}

private fun trendY(value: Double, min: Double, max: Double, height: Float): Float {
  val fraction = ((value - min) / (max - min)).toFloat()
  return height - fraction * height
}

private fun signed(value: Double): String {
  val text = formatOne(kotlin.math.abs(value))
  return if (value >= 0) "+$text" else "-$text"
}

private fun formatOne(value: Double): String =
  if (value % 1.0 == 0.0) value.toInt().toString() else String.format("%.1f", value)

private fun formatWater(ml: Double, unit: String): String = when (unit) {
  "oz" -> String.format("%.1f", ml / 29.5735) + "oz"
  "liter" -> String.format("%.2f", ml / 1000.0) + "L"
  else -> "${ml.toInt()}ml"
}
