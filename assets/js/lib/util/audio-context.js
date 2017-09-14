let _audioContext = null;

export function getAudioContext() {
    if (!_audioContext) {
        let AC = (window.AudioContext || window.webkitAudioContext);
        if (!AC) {
            return null;
        } else {
            _audioContext = new AC();
        }
    }
    return _audioContext;
}
