import AVFoundation

/// Speaks a wrist-only run's split cues ("Kilometer 3, 5 minutes 24 seconds").
/// Audio comes out of the watch speaker or paired Bluetooth headphones; the
/// wearer turns it on with the phone's Voice cues switch (`runVoiceCues`).
final class WatchRunCues: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = WatchRunCues()

    private let synthesizer = AVSpeechSynthesizer()

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// Queues `text` after whatever is being said. A step change passes
    /// `interrupt` so it is heard at once, but a split spoken in the same
    /// second waits its turn instead of cutting it off.
    func speak(_ text: String, interrupt: Bool = false) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(
            .playback,
            mode: .voicePrompt,
            options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
        )
        try? session.setActive(true)
        if interrupt { synthesizer.stopSpeaking(at: .immediate) }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.identifier.replacingOccurrences(of: "_", with: "-"))
        synthesizer.speak(utterance)
    }

    /// Hands the audio back once the last cue is done, so music or a podcast
    /// that was ducked for it comes back up.
    private func releaseAudioIfIdle() {
        guard !synthesizer.isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        releaseAudioIfIdle()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        releaseAudioIfIdle()
    }

    /// "5 minutes 24 seconds", spelled out for speech.
    static func duration(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded())
        let minutes = total / 60
        let secs = total % 60
        var parts: [String] = []
        if minutes > 0 { parts.append("\(minutes) minute\(minutes == 1 ? "" : "s")") }
        if secs > 0 || minutes == 0 { parts.append("\(secs) second\(secs == 1 ? "" : "s")") }
        return parts.joined(separator: " ")
    }

    /// What is said when a plan step begins: "Run, 1 minute."
    static func stepText(label: String, seconds: TimeInterval) -> String {
        "\(label), \(duration(seconds))."
    }

    /// Words for a completed split. Durations are spelled out because a speech
    /// engine reads "5:24" as a time of day.
    static func splitText(number: Int, seconds: TimeInterval, usesMiles: Bool) -> String {
        let unit = usesMiles ? "Mile" : "Kilometer"
        return "\(unit) \(number). \(duration(seconds))."
    }

    /// Whole units covered, and how many of them are new since `cued`.
    static func completedSplits(distanceMeters: Double, usesMiles: Bool) -> Int {
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        return Int((distanceMeters / unitMeters).rounded(.down))
    }
}
