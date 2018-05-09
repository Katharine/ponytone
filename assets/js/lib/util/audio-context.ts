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

// If this isn't called after some user interaction, Chrome doesn't work.
// http://crbug.com/840866
export async function kickAudioContext(): Promise<void> {
    const ac = getAudioContext();
    if (ac.state === 'suspended') {
        console.log("Resuming the audio context, which seems to have suspended itself. http://crbug.com/840866");
        await ac.resume();
    }
}
