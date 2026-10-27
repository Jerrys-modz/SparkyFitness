package com.sparkyapps.sparkyfitness.widget

import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp

/**
 * The size steps of the resizable widgets (`SizeMode.Responsive`). Each step
 * is the smallest size its layout is drawn for, and the launcher shows the
 * step closest to the widget's real size among those that fit. Each set holds
 * the larger of any two of its steps, so that is always the largest step that
 * fits.
 *
 * A line of text is about 1.33 x its sp tall, because Glance keeps the font
 * padding. Cells measured for reference: Pixel portrait, 2 columns 130 dp,
 * 4 columns 276 dp, 1 row 102 dp, 2 rows 220 dp; HyperOS, 2 columns 149 dp,
 * 3 columns 241 dp, 1 row 75 dp, 2 rows 167 dp, 3 rows 260 dp.
 */
internal object WidgetSizes {

    /**
     * From here the calorie and macro widgets get the Diary and fasting
     * shortcuts and the macro grams against their goals: 3 columns on HyperOS,
     * 4 on a Pixel.
     */
    private val WIDE = 230.dp

    // Calorie widget.
    private val CALORIE_MIN = DpSize(110.dp, 40.dp)

    /**
     * The classic layout: 24 padding + 23.9 heading + 8 + 8 bar + 32 shortcut
     * row = 96 dp at font scale 1.0, so a Pixel's 2x1 (102 dp) keeps it. Below
     * that the compact layout puts the shortcuts beside the bar.
     */
    private val CALORIE_CLASSIC_HEIGHT = 96.dp

    /**
     * The classic layout plus the Goal / Food / Burned row (8 + 14.6 label +
     * 18.6 value): 137 dp at font scale 1.0, 154 at 1.3, so it fits a HyperOS
     * 4x2 (167 dp). The row sits in the flexible space, so if it is still too
     * tall it is cut and the shortcuts are not.
     */
    val CALORIE_FIGURES_HEIGHT = 160.dp

    val calorieSizes: Set<DpSize> = setOf(
        CALORIE_MIN,
        DpSize(CALORIE_MIN.width, CALORIE_CLASSIC_HEIGHT),
        DpSize(WIDE, CALORIE_MIN.height),
        DpSize(WIDE, CALORIE_CLASSIC_HEIGHT),
        DpSize(WIDE, CALORIE_FIGURES_HEIGHT),
    )

    // Macro widget.
    private val MACRO_MIN = DpSize(110.dp, 110.dp)

    /**
     * The large layout: 28 padding + 26.5 heading + 2 + 16 eaten line (12 sp)
     * + 10 + three rows of 26.6 (14 sp, 6 dp bar) + 2 x 8 + 12 + 40 shortcut
     * row = 230 dp at font scale 1.0, 260 at 1.3, so it fits a HyperOS 4x3
     * (260 dp).
     */
    val MACRO_LARGE_HEIGHT = 255.dp

    val macroSizes: Set<DpSize> = setOf(
        MACRO_MIN,
        DpSize(WIDE, MACRO_MIN.height),
        DpSize(WIDE, MACRO_LARGE_HEIGHT),
    )

    // Water widget.
    private val WATER_MIN = DpSize(110.dp, 40.dp)

    /**
     * The classic layout (2x2), about 147 dp at font scale 1.0. Below it a
     * one-row widget gets a compact layout: 16 padding + 21.3 amount (16 sp) +
     * 4 + 28 bar and buttons row = 70 dp, for a HyperOS 2x1 (75 dp).
     */
    private val WATER_CLASSIC_HEIGHT = 110.dp

    /**
     * From here the water widget lays out side by side. Two 56 dp buttons and
     * the gaps leave the amount 173 dp at a HyperOS 4 columns (333 dp), enough
     * for "1,250 / 2,800 ml" at 20 sp; at 3 columns (241 dp) or a Pixel's 4
     * (276 dp) it would be cut, so those keep the stacked layouts.
     */
    private val WATER_WIDE = 300.dp

    val waterSizes: Set<DpSize> = setOf(
        WATER_MIN,
        DpSize(WATER_MIN.width, WATER_CLASSIC_HEIGHT),
        DpSize(WATER_WIDE, WATER_MIN.height),
        DpSize(WATER_WIDE, WATER_CLASSIC_HEIGHT),
    )

    fun isWide(size: DpSize): Boolean = size.width >= WIDE

    fun isWideWater(size: DpSize): Boolean = size.width >= WATER_WIDE

    /**
     * A wide water widget below the classic height drops the title and puts
     * a status in place of the bar: 16 padding + 26.5 amount + 6 + 8 bar =
     * 57 dp beside 40 dp buttons (a status line at font scale 1.3 makes it
     * 74), for a HyperOS 4x1 (75 dp).
     */
    fun isShortWater(size: DpSize): Boolean = size.height < WATER_CLASSIC_HEIGHT

    fun isCompactCalorie(size: DpSize): Boolean = size.height < CALORIE_CLASSIC_HEIGHT
}
