import sys
import whisper

def transcribe_audio(file_path):
    model = whisper.load_model("base")
    result = model.transcribe(file_path)
    return result["text"]

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python transcribe.py <audio_file_path>")
        sys.exit(1)

    audio_file_path = sys.argv[1]
    transcription = transcribe_audio(audio_file_path)
    print(transcription)