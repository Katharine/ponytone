let _audioContext: AudioContext = null;

export function getAudioContext(): AudioContext {
    if (!_audioContext) {
        let AC: any = (window.AudioContext || window.webkitAudioContext);
        if (!AC) {
            return null;
        } else {
            _audioContext = new AC();
        }
    }
    return _audioContext;
}
