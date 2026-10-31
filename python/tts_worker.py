import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf
import spacy
from misaki import en
from pypdf import PdfReader


SAMPLE_RATE = 24_000
MAX_PHONEMES = 510
LETTER_NAMES = {
    "a": "A",
    "b": "bi",
    "c": "si",
    "d": "di",
    "e": "i",
    "f": "ɛf",
    "g": "ʤi",
    "h": "Aʧ",
    "i": "I",
    "j": "ʤA",
    "k": "kA",
    "l": "ɛl",
    "m": "ɛm",
    "n": "ɛn",
    "o": "O",
    "p": "pi",
    "q": "kju",
    "r": "ɑɹ",
    "s": "ɛs",
    "t": "ti",
    "u": "ju",
    "v": "vi",
    "w": "dʌbəlju",
    "x": "ɛks",
    "y": "wI",
    "z": "zi",
}


def emit(event_type, **data):
    print(json.dumps({"type": event_type, **data}), flush=True)


def extract_pdf_text(pdf_path):
    reader = PdfReader(pdf_path)
    if reader.is_encrypted:
        raise ValueError("Password-protected PDFs are not supported yet.")

    page_text = []
    page_count = len(reader.pages)
    for page_number, page in enumerate(reader.pages, start=1):
        page_text.append(page.extract_text() or "")
        percent = 2 + round(page_number / max(page_count, 1) * 10)
        emit(
            "progress",
            percent=percent,
            status=f"Reading page {page_number} of {page_count}",
        )

    text = re.sub(r"\s+", " ", " ".join(page_text)).strip()
    if not text:
        raise ValueError(
            "No selectable text was found. Scanned PDFs need OCR before conversion."
        )
    return text


def split_text(text, max_characters=260):
    sentences = re.split(r"(?<=[.!?])\s+", text)
    for sentence in sentences:
        words = sentence.split()
        current = []
        current_length = 0
        for word in words:
            extra_length = len(word) + (1 if current else 0)
            if current and current_length + extra_length > max_characters:
                yield " ".join(current)
                current = []
                current_length = 0
            current.append(word)
            current_length += len(word) + (1 if len(current) > 1 else 0)
        if current:
            yield " ".join(current)


def phonemize_text(g2p, text):
    try:
        return g2p(text)[0]
    except TypeError:
        pieces = re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)*|[^A-Za-z]+", text)
        phoneme_pieces = []
        for piece in pieces:
            if not piece.replace("'", "").replace("’", "").isalpha():
                phoneme_pieces.append(piece)
                continue

            try:
                phoneme_pieces.append(g2p(piece)[0])
            except TypeError:
                spelling = " ".join(
                    LETTER_NAMES[character.lower()]
                    for character in piece
                    if character.lower() in LETTER_NAMES
                )
                if spelling:
                    phoneme_pieces.append(spelling)

        return "".join(phoneme_pieces)


def phoneme_chunks(phonemes, vocabulary):
    space_id = vocabulary.get(" ")
    current_ids = []
    for phoneme_word in phonemes.split():
        word_ids = [vocabulary[character] for character in phoneme_word if character in vocabulary]
        if not word_ids:
            continue
        separator = [space_id] if current_ids and space_id is not None else []
        if current_ids and len(current_ids) + len(separator) + len(word_ids) > MAX_PHONEMES:
            yield current_ids
            current_ids = []
            separator = []
        current_ids.extend(separator)
        while len(word_ids) > MAX_PHONEMES:
            yield word_ids[:MAX_PHONEMES]
            word_ids = word_ids[MAX_PHONEMES:]
        current_ids.extend(word_ids)

    if current_ids:
        yield current_ids


def convert(args):
    emit("progress", percent=0, status="Opening PDF")
    text = extract_pdf_text(args.pdf)
    segments = list(split_text(text))
    if not segments:
        raise ValueError("No readable text was found in this PDF.")

    if not spacy.util.is_package("en_core_web_sm"):
        raise RuntimeError(
            "The local English phonemizer model is missing. Run the setup command in README.md."
        )

    config_path = Path(args.assets) / "config.json"
    voice_path = Path(args.assets) / "af_msa.bin"
    model_path = Path(args.model)
    for asset_path in (config_path, voice_path, model_path):
        if not asset_path.is_file():
            raise FileNotFoundError(f"Required offline model file is missing: {asset_path.name}")

    with config_path.open(encoding="utf-8") as config_file:
        vocabulary = json.load(config_file)["vocab"]
    voice = np.fromfile(voice_path, dtype=np.float32).reshape(-1, 1, 256)

    emit("progress", percent=14, status="Preparing document text")
    g2p = en.G2P(trf=False, british=False, fallback=None, unk="❓")
    ids_to_synthesize = []
    for segment_number, segment in enumerate(segments, start=1):
        phonemes = phonemize_text(g2p, segment)
        ids_to_synthesize.extend(phoneme_chunks(phonemes, vocabulary))
        percent = 14 + round(segment_number / len(segments) * 11)
        emit(
            "progress",
            percent=percent,
            status=f"Preparing passage {segment_number} of {len(segments)}",
        )

    if not ids_to_synthesize:
        raise ValueError("The PDF text could not be converted to speech sounds.")

    emit("progress", percent=26, status="Loading offline voice")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 4
    session = ort.InferenceSession(
        str(model_path), options, providers=["CPUExecutionProvider"]
    )
    speed = np.array([args.speed], dtype=np.float32)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with sf.SoundFile(
        output_path,
        mode="w",
        samplerate=SAMPLE_RATE,
        channels=1,
        subtype="PCM_16",
    ) as audio_file:
        for chunk_number, token_ids in enumerate(ids_to_synthesize, start=1):
            waveform = session.run(
                None,
                {
                    "input_ids": np.array([[0, *token_ids, 0]], dtype=np.int64),
                    "style": voice[len(token_ids) - 1],
                    "speed": speed,
                },
            )[0]
            audio_file.write(waveform)
            percent = 26 + round(chunk_number / len(ids_to_synthesize) * 73)
            emit(
                "progress",
                percent=percent,
                status=f"Generating audio {chunk_number} of {len(ids_to_synthesize)}",
            )

    emit("progress", percent=100, status="Audio ready")
    emit("complete", sampleRate=SAMPLE_RATE, chunks=len(ids_to_synthesize))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--assets", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--speed", type=float, default=1.0)
    args = parser.parse_args()

    try:
        convert(args)
    except Exception as error:
        emit("error", message=str(error))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())