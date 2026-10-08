import WidgetKit
import SwiftUI

@main
struct exportWatchWidgets: WidgetBundle {
    var body: some Widget {
        EnergyGoalComplication()
        WaterGoalComplication()
        ProteinGoalComplication()
        CarbsGoalComplication()
        FatGoalComplication()
        FastingComplication()
        StepsComplication()
        if #available(watchOS 26.0, *) {
            LogWaterWatchControl()
            FastingWatchControl()
        }
    }
}
