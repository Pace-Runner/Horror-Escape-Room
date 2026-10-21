"""
Splits the Session 14 voices -- generated as one file, both speakers, every
line in order -- into the ten clips the game plays at their subtitles' times:
src/assets/voice/level2/tape_01_man.m4a ... tape_10_girl.m4a.

    blender --background --python blender/split_session_tape_voices.py [-- <voices file>]

The source defaults to blender/source/session_14_voices.m4a. Between the lines
it is silent, so each line is cut out by where its speech starts and stops
(LINES below, in seconds into the source). Pauses INSIDE a line are shortened
to at most MAX_PAUSE_IN_SECONDS -- ElevenLabs leaves 1.3 s ones, which ran the
lines past their places on the tape. Where each line plays is set in
src/story/sessionTape.js; keep the two in step if the voices are regenerated.

Blender is here for its audio reading (aud) and its FFmpeg, as in
build_session_tape_audio.py: nothing else on a bare machine decodes and
encodes AAC.
"""

import os
import sys
import tempfile
import wave

import aud
import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, 'source', 'session_14_voices.m4a')
OUT_DIR = os.path.abspath(os.path.join(HERE, '..', 'src', 'assets', 'voice', 'level2'))

# Each line: its file, and the stretches of speech in the source that make it
# up (start, end), in seconds. Found by the silences and told apart by pitch:
# the man speaks at 80-95 Hz (140-180 Hz shouting), the girl at 190-460 Hz.
LINES = [
    ('tape_01_man', [(0.11, 1.37), (2.59, 5.26), (5.70, 7.09)]),
    ('tape_02_man', [(8.50, 9.26), (9.85, 12.47), (12.79, 14.78), (16.06, 16.73), (18.00, 19.11)]),
    ('tape_03_man', [(20.35, 22.46), (22.80, 25.11)]),
    ('tape_04_girl', [(25.85, 26.59)]),
    ('tape_05_man', [(27.45, 28.31), (28.71, 29.94)]),
    ('tape_06_man', [(31.09, 31.66), (31.78, 32.53)]),
    ('tape_07_girl', [(33.31, 34.08), (34.32, 35.29)]),
    ('tape_08_man', [(35.61, 36.13), (36.30, 36.97)]),
    ('tape_09_girl', [(37.44, 37.96), (38.12, 38.82), (39.22, 39.98)]),
    ('tape_10_girl', [(40.80, 41.49)]),
]
MAX_PAUSE_IN_SECONDS = 0.45
# A little air either side of each line, so no word starts or ends clipped.
EDGE_IN_SECONDS = 0.06


def read_source(path):
    sound = aud.Sound(path)
    rate = int(sound.specs[0])
    samples = sound.data()
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    return rate, samples.astype(np.float32)


def assemble(rate, samples, stretches):
    """One line: its stretches of speech, with the pauses between them capped."""
    pieces = []
    for i, (start, end) in enumerate(stretches):
        a = max(0, int((start - (EDGE_IN_SECONDS if i == 0 else 0)) * rate))
        b = min(len(samples), int((end + (EDGE_IN_SECONDS if i == len(stretches) - 1 else 0)) * rate))
        if i:
            pause = min(MAX_PAUSE_IN_SECONDS, start - stretches[i - 1][1])
            pieces.append(np.zeros(int(pause * rate), np.float32))
        pieces.append(samples[a:b])
    line = np.concatenate(pieces)
    # Fade the very ends in and out over 10 ms, so a cut never clicks.
    fade = int(0.01 * rate)
    line[:fade] *= np.linspace(0, 1, fade)
    line[-fade:] *= np.linspace(1, 0, fade)
    return line


def write_wav(path, rate, samples):
    with wave.open(path, 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())


def encode(wav_path, out_path, seconds):
    """AAC in an MP4 container, as a sequencer render with no picture (see build_session_tape_audio.py)."""
    scene = bpy.context.scene
    editor = scene.sequence_editor_create()
    strips = editor.strips if hasattr(editor, 'strips') else editor.sequences
    for strip in list(strips):
        strips.remove(strip)
    fps = 24
    frames = int(seconds * fps) + 2
    scene.render.fps = fps
    scene.frame_start = 1
    scene.frame_end = frames
    strips.new_sound('Line', wav_path, channel=1, frame_start=1)
    strips.new_effect('Black', 'COLOR', channel=2, frame_start=1, length=frames).color = (0, 0, 0)
    render = scene.render
    render.resolution_x = render.resolution_y = 16
    render.image_settings.media_type = 'VIDEO'
    render.image_settings.file_format = 'FFMPEG'
    render.ffmpeg.format = 'MPEG4'
    render.ffmpeg.codec = 'NONE'
    render.ffmpeg.audio_codec = 'AAC'
    render.ffmpeg.audio_channels = 'MONO'
    render.ffmpeg.audio_bitrate = 128
    render.ffmpeg.audio_mixrate = 44100
    render.use_file_extension = False
    render.filepath = out_path
    bpy.ops.render.render(animation=True)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    source = argv[0] if argv else SOURCE
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rate, samples = read_source(source)
    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = tempfile.mkdtemp()
    for name, stretches in LINES:
        line = assemble(rate, samples, stretches)
        seconds = len(line) / rate
        wav_path = os.path.join(tmp, name + '.wav')
        write_wav(wav_path, rate, line)
        out_path = os.path.join(OUT_DIR, name + '.m4a')
        encode(wav_path, out_path, seconds)
        print(f'LINE {name}: {seconds:.2f} s -> {out_path}')
    sys.exit(0)
