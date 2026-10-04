import WidgetKit
import SwiftUI

@main
struct exportWidgets: WidgetBundle {
    var body: some Widget {
        widget()
        macroWidget()
        if #available(iOS 18.0, *) {
            LogWaterControl()
            StartFastControl()
            EndFastControl()
        }
    }
}
