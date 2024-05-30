const puppeteer = require("puppeteer");
const robot = require("robotjs");
const fs = require("fs");
const { exec } = require("child_process");
const path = require("path");
const util = require("util");

// Promisify exec and setTimeout for easier async/await usage
const execPromise = util.promisify(exec);
const wait = util.promisify(setTimeout);

// Path to your Whisper model script
const whisperModelScript = path.join(__dirname, "transcribe.py");

async function transcribeAudio(filePath) {
  try {
    const { stdout } = await execPromise(
      `python ${whisperModelScript} "${filePath}"`
    );
    return stdout;
  } catch (error) {
    throw new Error(`Failed to transcribe ${filePath}: ${error.message}`);
  }
}

async function run() {
  const downloadPath = path.resolve(__dirname, "audio_captures");

  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath);
  }

  // Start Xvfb
  const xvfb = exec("Xvfb :99 -screen 0 1280x1024x24");
  process.env.DISPLAY = ":99";

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--start-maximized",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-extensions-except=~/audio-recorder/audio-recorder-ffmpeg",
      "--load-extension=~/audio-recorder/audio-recorder-ffmpeg",
    ],
    timeout: 60000,
    dumpio: true,
  });

  const [page] = await browser.pages();
  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadPath,
  });

  await page.goto("https://www.youtube.com/watch/?v/=rUzx9r8zCrY");

  // Wait for video to start playing
  try {
    await page.waitForFunction(
      'document.querySelector("video").currentTime > 0',
      { timeout: 10000 }
    );
  } catch (e) {
    console.error("Timed out waiting for video to start");
    await browser.close();
    xvfb.kill();
    return;
  }

  const videoDuration = await page.evaluate(
    'document.querySelector("video").duration'
  );

  let start = 0;
  const captureDuration = 10; // interval to capture audio in seconds

  const transcriptionFile = path.join(__dirname, "transcription.txt");
  fs.writeFileSync(transcriptionFile, ""); // Initialize the transcription file

  while (start < videoDuration) {
    const audioFilePath = path.join(downloadPath, `audio_${start}.wav`);

    // Start audio capture
    console.log("Audio capture starting...");
    if (process.platform === "darwin") {
      exec(
        'osascript -e \'tell application "System Events" to keystroke "u" using {command down, shift down}\''
      );
    } else {
      robot.keyTap("u", ["control", "shift"]);
    }

    let waitDuration = Math.min(captureDuration, videoDuration - start);

    console.log(`Waiting for ${waitDuration} seconds...`);
    await wait(waitDuration * 1000);

    // Stop Audio Capture
    console.log("Stopping audio capture...");
    if (process.platform === "darwin") {
      exec(
        'osascript -e \'tell application "System Events" to keystroke "e" using {command down, shift down}\''
      );
    } else {
      robot.keyTap("e", ["control", "shift"]);
    }

    // Wait for a while to let download finish (if necessary), adjust as per your needs
    await wait(5000);

    // Verify that the audio file has been created
    const maxAttempts = 10;
    let attempts = 0;
    while (!fs.existsSync(audioFilePath) && attempts < maxAttempts) {
      console.log(`Waiting for audio file ${audioFilePath} to be created...`);
      await wait(1000); // wait 1 second and check again
      attempts++;
    }

    if (fs.existsSync(audioFilePath)) {
      // Transcribe the audio file
      try {
        const transcription = await transcribeAudio(audioFilePath);
        fs.appendFileSync(transcriptionFile, transcription + "\n");
        console.log(`Transcription saved for ${audioFilePath}`);
      } catch (error) {
        console.error(error.message);
      }
    } else {
      console.error(
        `Failed to find audio file ${audioFilePath} after ${maxAttempts} attempts`
      );
    }

    start += captureDuration;
  }

  await browser.close();
  xvfb.kill();
}
run();
