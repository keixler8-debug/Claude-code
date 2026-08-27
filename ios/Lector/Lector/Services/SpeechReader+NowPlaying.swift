import AVFoundation
import Foundation
import MediaPlayer

/// Los mandos de la pantalla de bloqueo, del centro de control, de los
/// auriculares y del coche. Sin esto la app sería inútil con el móvil en el
/// bolsillo, que es justo donde se oye un audiolibro.
extension SpeechReader {

    func setUpRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()

        _ = center.playCommand.addTarget { [weak self] _ in
            self?.play()
            return .success
        }
        _ = center.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }
        _ = center.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.togglePlay()
            return .success
        }

        center.skipForwardCommand.preferredIntervals = [30]
        _ = center.skipForwardCommand.addTarget { [weak self] _ in
            self?.skip(seconds: 30)
            return .success
        }
        center.skipBackwardCommand.preferredIntervals = [15]
        _ = center.skipBackwardCommand.addTarget { [weak self] _ in
            self?.skip(seconds: -15)
            return .success
        }

        // Arrastrar la barra desde la pantalla de bloqueo.
        _ = center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self,
                  let event = event as? MPChangePlaybackPositionCommandEvent,
                  let total = self.estimatedTotalSeconds, total > 0 else { return .commandFailed }
            self.seek(to: event.positionTime / total)
            return .success
        }
    }

    var estimatedTotalSeconds: Double? {
        guard let book else { return nil }
        return Double(book.totalCharacters) / speed.charactersPerSecond
    }

    func updateNowPlaying() {
        guard let book, let total = estimatedTotalSeconds else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: book.title,
            MPMediaItemPropertyArtist: "Lector",
            MPMediaItemPropertyAlbumTitle: "Página \(currentPage) de \(book.pageCount)",
            MPMediaItemPropertyPlaybackDuration: total,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsedSeconds,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue
        ]
    }
}
