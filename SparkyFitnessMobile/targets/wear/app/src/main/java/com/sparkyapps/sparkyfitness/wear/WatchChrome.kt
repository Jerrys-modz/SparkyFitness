package com.sparkyapps.sparkyfitness.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.TimeText

/** Same colours as the Apple Watch pages. */
internal object Palette {
  val calories = Color(0xFF8992DC)
  val protein = Color(0xFFDBB06F)
  val carbs = Color(0xFF97C692)
  val fat = Color(0xFF8AC2DA)
  val orange = Color(0xFFFF9F0A)
  val blue = Color(0xFF0A84FF)
  val green = Color(0xFF30D158)
  val water = Color(0xFF64D2FF)
  val red = Color(0xFFFF453A)
  val card = Color(0xFF3A3A3C)
  val secondary = Color(0xFF8E8E93)
  val superset = listOf(
    Color(0xFF6992D3),
    Color(0xFFD18A61),
    Color(0xFF9166CC),
    Color(0xFF6AA46F),
    Color(0xFFCC6688),
    Color(0xFF5AADAF),
    Color(0xFFD4A954),
    Color(0xFF6E7687),
  )
}

@Composable
internal fun WatchFrame(
  page: Int,
  horizontal: Dp = 32.dp,
  content: @Composable BoxScope.() -> Unit,
) {
  MaterialTheme {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
      TimeText()
      Box(
        Modifier
          .fillMaxSize()
          .padding(start = horizontal, end = horizontal, top = 24.dp, bottom = 18.dp),
        content = content,
      )
      Row(
        Modifier.align(Alignment.BottomCenter).padding(bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
      ) {
        repeat(5) { index ->
          Box(
            Modifier
              .size(if (index == page) 6.dp else 4.dp)
              .background(if (index == page) Color.White else Palette.secondary, CircleShape),
          )
        }
      }
    }
  }
}

@Composable
internal fun CalorieRing(progress: Float, modifier: Modifier = Modifier) {
  Canvas(modifier) {
    val stroke = Stroke(width = 6.dp.toPx(), cap = StrokeCap.Round)
    val inset = stroke.width / 2f
    val arcSize = Size(size.width - stroke.width, size.height - stroke.width)
    val origin = Offset(inset, inset)
    drawArc(
      color = Palette.secondary.copy(alpha = 0.35f),
      startAngle = 0f,
      sweepAngle = 360f,
      useCenter = false,
      topLeft = origin,
      size = arcSize,
      style = stroke,
    )
    drawArc(
      color = Palette.calories,
      startAngle = -90f,
      sweepAngle = 360f * progress.coerceIn(0f, 1f),
      useCenter = false,
      topLeft = origin,
      size = arcSize,
      style = stroke,
    )
  }
}

@Composable
internal fun BarbellIcon(modifier: Modifier = Modifier) {
  Canvas(modifier) {
    val gray = Palette.secondary
    val y = size.height * 0.62f
    drawLine(gray, Offset(size.width * 0.18f, y), Offset(size.width * 0.82f, y), strokeWidth = 3f, cap = StrokeCap.Round)
    drawRect(gray, Offset(size.width * 0.12f, y - 9f), Size(5f, 18f))
    drawRect(gray, Offset(size.width * 0.82f, y - 9f), Size(5f, 18f))
    drawCircle(gray, 5f, Offset(size.width / 2f, y - 16f))
    drawLine(gray, Offset(size.width / 2f, y - 11f), Offset(size.width / 2f, y), strokeWidth = 3f)
  }
}

@Composable
internal fun HeartIcon(color: Color, modifier: Modifier = Modifier) {
  Canvas(modifier) {
    val r = size.minDimension * 0.22f
    drawCircle(color, r, Offset(size.width * 0.38f, size.height * 0.4f))
    drawCircle(color, r, Offset(size.width * 0.62f, size.height * 0.4f))
    drawLine(color, Offset(size.width * 0.2f, size.height * 0.48f), Offset(size.width * 0.5f, size.height * 0.86f), strokeWidth = r * 1.6f, cap = StrokeCap.Round)
    drawLine(color, Offset(size.width * 0.8f, size.height * 0.48f), Offset(size.width * 0.5f, size.height * 0.86f), strokeWidth = r * 1.6f, cap = StrokeCap.Round)
  }
}

@Composable
internal fun FlameIcon(modifier: Modifier = Modifier) {
  Canvas(modifier) {
    drawCircle(Palette.orange, size.minDimension * 0.28f, Offset(size.width / 2f, size.height * 0.58f))
    drawCircle(Palette.orange, size.minDimension * 0.18f, Offset(size.width / 2f, size.height * 0.32f))
  }
}
