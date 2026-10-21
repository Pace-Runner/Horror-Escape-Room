"""
Builds the Session 14 tape's sound: src/assets/audio/tape/session_14.m4a.

Session 14 was taken down on the lab's cassette recorder, standing on the
instrument trolley beside the restraint table. This
is everything on the tape EXCEPT the two voices, which the game plays as their
own clips at their subtitles' times (src/assets/voice/level2/tape_*.m4a), so a
line can be re-recorded without rebuilding this. The times match the
subtitles in src/story/sessionTape.js:

     0.0  the REC key going down, the motor taking up, hiss from then on
     0.3  his heavy breathing under sedation, once
    28.0  the restraints straining; at 28.2 him grunting, losing it, once
    32.0  a strap snapping
    35.6  the struggle at the trolley
    36.6  the recorder knocked off it, glass shattering as it goes --
          and from here on it hears the room from the floor, muffled
    38.2  something heavy moving away
    41.6  the alarm
    45.6  the recording cut off

The room, the restraints, the fall and the alarm are synthesised from the
standard library -- noise, filters and envelopes. His breathing, his grunting
and the chamber's glass are recordings in blender/source/
(male_heavy_breathing.mp3, male_grunting_and_panting.mp3,
large_window_shatter.mp3), mixed in at those times. Blender reads them and
encodes the result: it carries FFmpeg, and nothing else on a bare machine
does. (Its
sound mixdown would be the obvious way, but run headless it writes one
buffer and stops; a render with no picture writes the whole track.)

Run headless: blender --background --python blender/build_session_tape_audio.py
"""

import math
import os
import random
import struct
import sys
import tempfile
import wave

import aud
import bpy
import numpy as np

SAMPLE_RATE = 44100
TAPE_SECONDS = 47
RECORDER_FALLS_AT_SECONDS = 36.6
RECORDING_STOPS_AT_SECONDS = 45.6
# How dull the room sounds once the recorder is on the floor, face down.
ON_THE_FLOOR_CUTOFF_HZ = 900

# Real recordings mixed in where synthesis would not do: the subject's breathing,
# his grunting as he loses it, and the containment chamber's glass going.
SOURCE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'source')
OUT_PATH = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                        '..', 'src', 'assets', 'audio', 'tape', 'session_14.m4a'))

random.seed(14)


class Track:
    """A mono mix, in floats, that sounds are added into at a time."""

    def __init__(self, seconds):
        self.samples = [0.0] * int(seconds * SAMPLE_RATE)

    def add(self, seconds, sound, gain=1.0):
        start = int(seconds * SAMPLE_RATE)
        for i, value in enumerate(sound):
            at = start + i
            if at >= len(self.samples):
                break
            self.samples[at] += value * gain

    def write(self, path):
        peak = max(1e-9, max(abs(v) for v in self.samples))
        scale = min(1.0, 0.9 / peak)
        with wave.open(path, 'wb') as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(SAMPLE_RATE)
            frames = bytearray()
            for value in self.samples:
                # A soft clip, like a cheap microphone overloading on the impact.
                value = math.tanh(value * scale * 1.3) / math.tanh(1.3)
                frames += struct.pack('<h', int(max(-1.0, min(1.0, value)) * 32000))
            out.writeframes(bytes(frames))


def noise(seconds):
    return [random.uniform(-1, 1) for _ in range(int(seconds * SAMPLE_RATE))]


def low_pass(samples, cutoff_hz):
    """One pole: dulls a sound, the way a wall or a cheap mic does."""
    a = 1 - math.exp(-2 * math.pi * cutoff_hz / SAMPLE_RATE)
    out, y = [], 0.0
    for x in samples:
        y += a * (x - y)
        out.append(y)
    return out


def high_pass(samples, cutoff_hz):
    lowered = low_pass(samples, cutoff_hz)
    return [x - y for x, y in zip(samples, lowered)]


def band(samples, low_hz, high_hz):
    return low_pass(high_pass(samples, low_hz), high_hz)


def envelope(samples, attack_s, decay_s):
    """Rises over attack_s, then dies away exponentially over decay_s."""
    out = []
    attack = max(1, int(attack_s * SAMPLE_RATE))
    for i, x in enumerate(samples):
        level = i / attack if i < attack else math.exp(-(i - attack) / (decay_s * SAMPLE_RATE))
        out.append(x * level)
    return out


def swell(samples, seconds):
    """Up and down again over its length: a breath."""
    n = len(samples)
    return [x * math.sin(math.pi * i / n) ** 1.5 for i, x in enumerate(samples)]


def tone(freq_hz, seconds, shape='sine'):
    out = []
    for i in range(int(seconds * SAMPLE_RATE)):
        phase = (i * freq_hz / SAMPLE_RATE) % 1.0
        out.append(math.sin(2 * math.pi * phase) if shape == 'sine' else (1.0 if phase < 0.5 else -1.0))
    return out


def muffled(sound):
    """A sound as the recorder hears it lying on the floor."""
    return low_pass(low_pass(sound, ON_THE_FLOOR_CUTOFF_HZ), ON_THE_FLOOR_CUTOFF_HZ)



def thump(gain, cutoff_hz=180, decay_s=0.18):
    body = envelope(low_pass(noise(0.6), cutoff_hz), 0.004, decay_s)
    knock = envelope(tone(62, 0.6), 0.002, decay_s * 1.4)
    return [(b * 3 + k * 0.8) * gain for b, k in zip(body, knock)]


def key_clunk(gain):
    """A recorder's piano key going down: a sharp click, then the mechanism seating."""
    click = envelope(high_pass(noise(0.05), 2500), 0.0005, 0.006)
    seat = envelope(band(noise(0.12), 300, 1800), 0.002, 0.03)
    out = [0.0] * int(0.12 * SAMPLE_RATE)
    for i, x in enumerate(click):
        out[i] += x * 1.2
    for i, x in enumerate(seat):
        if i + 900 < len(out):
            out[i + 900] += x * 0.7
    return [x * gain for x in out]


def motor_whine(seconds, gain):
    """The capstan motor, heard faintly through the case: a low hum with a little flutter."""
    out = []
    for i in range(int(seconds * SAMPLE_RATE)):
        t = i / SAMPLE_RATE
        flutter = 1 + 0.004 * math.sin(2 * math.pi * 5.5 * t)
        out.append(math.sin(2 * math.pi * 118 * flutter * t) * 0.6 + math.sin(2 * math.pi * 236 * flutter * t) * 0.25)
    return [x * gain for x in out]


def crack(gain):
    """Leather and buckle giving at once."""
    snap = envelope(high_pass(noise(0.25), 1800), 0.001, 0.035)
    return [x * gain for x in snap]


def creak(gain, length_s=0.35):
    """Leather straining against a buckle."""
    grain = band(noise(length_s), 600, 1500)
    out = []
    for i, x in enumerate(grain):
        flutter = 0.55 + 0.45 * math.sin(2 * math.pi * 31 * i / SAMPLE_RATE)
        out.append(x * flutter)
    return [x * gain for x in swell(out, length_s)]








def alarm(seconds, gain):
    """The lab's alarm: two tones, alternating."""
    out = []
    step = 0.36
    t = 0.0
    while t < seconds:
        freq = 940 if int(t / step) % 2 == 0 else 700
        out += tone(freq, step, 'square')
        t += step
    return [x * gain for x in low_pass(out, 1600)]


def recording(name, speed=1.0):
    """
    A recording from blender/source/, as the tape's own mono 44.1 kHz samples.
    `speed` above 1 plays it a little faster and higher, below 1 slower and
    lower -- so a sound used more than once is never the same take twice.
    """
    sound = aud.Sound(os.path.join(SOURCE_DIR, name))
    rate = sound.specs[0]
    data = sound.data()
    mono = data.mean(axis=1) if data.ndim > 1 else data
    duration = len(mono) / rate
    count = int(duration * SAMPLE_RATE / speed)
    at = np.linspace(0, len(mono) - 1, count)
    return np.interp(at, np.arange(len(mono)), mono).tolist()


def build_track():
    track = Track(TAPE_SECONDS)
    stop = RECORDING_STOPS_AT_SECONDS
    # REC going down, and the motor running from then until the recording is cut.
    track.add(0.0, key_clunk(0.5))
    track.add(0.05, motor_whine(stop - 0.05, 0.006))
    # The room: tape hiss and the hum of the lab's mains, all the way through.
    track.add(0.05, low_pass(noise(stop - 0.05), 5000), 0.035)
    track.add(0.05, tone(50, stop - 0.05), 0.012)
    # His breathing (male_heavy_breathing.mp3), heavy under the sedation: once,
    # as the tape starts.
    track.add(0.3, recording('male_heavy_breathing.mp3'), 0.6)
    # Straining against the straps, and the table taking it.
    t = 28.0
    while t < 32.0:
        track.add(t, creak(0.25))
        track.add(t + 0.18, thump(0.05, 260, 0.08))
        t += 0.55
    # And him, losing it (male_grunting_and_panting.mp3): once, a moment after
    # he wakes and the scientist says so ("He's waking. Note the time--"
    # ends at 27.7 s), as he first pulls against the straps.
    track.add(28.2, recording('male_grunting_and_panting.mp3'), 0.9)
    track.add(32.0, crack(0.7))
    track.add(32.02, thump(0.25, 220, 0.1))
    # The struggle at the trolley, right on top of the microphone.
    track.add(35.6, swell(band(noise(1.0), 200, 2500), 1.0), 0.25)
    track.add(36.2, thump(0.35, 500, 0.08))
    # The recorder knocked off it: handled, falling, hitting the floor, and the
    # instruments coming down round it.
    fall = RECORDER_FALLS_AT_SECONDS
    track.add(fall, thump(1.0, 450, 0.22))
    track.add(fall + 0.03, envelope(band(noise(0.08), 1500, 6000), 0.001, 0.02), 0.5)
    # Glass going with it (large_window_shatter.mp3), a little dulled.
    track.add(fall + 0.12, low_pass(recording('large_window_shatter.mp3'), 2600), 1.1)
    track.add(fall + 0.55, thump(0.5, 300, 0.14))
    # From the floor: something heavy moving away, glass, the alarm.
    for i, when in enumerate((38.2, 38.8, 39.35, 39.9)):
        track.add(when, muffled(thump(0.9 * (0.75 ** i), 160, 0.2)))
    track.add(41.6, muffled(alarm(stop - 41.6, 0.4)))
    # Cut off: the key coming up, and nothing after it.
    track.add(stop, key_clunk(0.45))
    return track


def encode(wav_path, out_path):
    """
    AAC in an MP4 container -- an .m4a, like the game's other recordings -- as
    a sequencer render with the video codec set to none. The render needs
    something to draw, so a black strip runs under the sound.
    """
    fps = 24
    frames = int(TAPE_SECONDS * fps)
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = 1
    scene.frame_end = frames
    editor = scene.sequence_editor_create()
    strips = editor.strips if hasattr(editor, 'strips') else editor.sequences
    strips.new_sound('SessionTape', wav_path, channel=1, frame_start=1)
    strips.new_effect('Black', 'COLOR', channel=2, frame_start=1, length=frames).color = (0, 0, 0)
    render = scene.render
    render.resolution_x = render.resolution_y = 16
    render.image_settings.media_type = 'VIDEO'
    render.image_settings.file_format = 'FFMPEG'
    render.ffmpeg.format = 'MPEG4'
    render.ffmpeg.codec = 'NONE'
    render.ffmpeg.audio_codec = 'AAC'
    render.ffmpeg.audio_channels = 'MONO'
    render.ffmpeg.audio_bitrate = 96
    render.ffmpeg.audio_mixrate = SAMPLE_RATE
    render.use_file_extension = False
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    render.filepath = out_path
    bpy.ops.render.render(animation=True)
    print('wrote', out_path)


if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    wav_path = os.path.join(tempfile.gettempdir(), 'session_14_tape.wav')
    build_track().write(wav_path)
    encode(wav_path, OUT_PATH)
    os.remove(wav_path)
    sys.exit(0)
