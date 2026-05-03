//! Audio playback for notification sounds
//!
//! Uses rodio to play WAV files from the sounds directory.
//! Audio playback runs in a dedicated thread to avoid blocking the main thread.

use parking_lot::{lock_api::RawMutex, Mutex};
use rodio::{Decoder, OutputStream, Sink};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use std::sync::mpsc::{channel, Sender};

/// Available notification sounds
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationSound {
    None,
    Pop,
    Ping,
    Glass,
    Hero,
    Blow,
    Bottle,
    Frog,
    Funk,
    Morse,
    Purr,
    Tink,
}

impl Default for NotificationSound {
    fn default() -> Self {
        NotificationSound::Hero
    }
}

impl NotificationSound {
    /// Get the filename for this sound
    pub fn filename(&self) -> Option<&'static str> {
        match self {
            NotificationSound::None => None,
            NotificationSound::Pop => Some("pop.wav"),
            NotificationSound::Ping => Some("ping.wav"),
            NotificationSound::Glass => Some("glass.wav"),
            NotificationSound::Hero => Some("hero.wav"),
            NotificationSound::Blow => Some("blow.wav"),
            NotificationSound::Bottle => Some("bottle.wav"),
            NotificationSound::Frog => Some("frog.wav"),
            NotificationSound::Funk => Some("funk.wav"),
            NotificationSound::Morse => Some("morse.wav"),
            NotificationSound::Purr => Some("purr.wav"),
            NotificationSound::Tink => Some("tink.wav"),
        }
    }

    /// Get all available sounds
    pub fn all() -> Vec<NotificationSound> {
        vec![
            NotificationSound::None,
            NotificationSound::Pop,
            NotificationSound::Ping,
            NotificationSound::Glass,
            NotificationSound::Hero,
            NotificationSound::Blow,
            NotificationSound::Bottle,
            NotificationSound::Frog,
            NotificationSound::Funk,
            NotificationSound::Morse,
            NotificationSound::Purr,
            NotificationSound::Tink,
        ]
    }
}

/// Audio command sent to the audio thread
enum AudioCommand {
    Play(Vec<u8>),
}

/// Global audio thread sender
static AUDIO_SENDER: Mutex<Option<Sender<AudioCommand>>> = Mutex::const_new(parking_lot::RawMutex::INIT, None);

/// Initialize the audio thread
fn ensure_audio_thread() -> Option<Sender<AudioCommand>> {
    let mut guard = AUDIO_SENDER.lock();
    if guard.is_none() {
        let (tx, rx) = channel::<AudioCommand>();

        std::thread::spawn(move || {
            // Create audio output in this thread
            let (_stream, stream_handle) = match OutputStream::try_default() {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("Failed to get audio output stream: {}", e);
                    return;
                }
            };

            loop {
                match rx.recv() {
                    Ok(AudioCommand::Play(data)) => {
                        let cursor = Cursor::new(data);
                        match Decoder::new(cursor) {
                            Ok(source) => {
                                let sink = match Sink::try_new(&stream_handle) {
                                    Ok(s) => s,
                                    Err(e) => {
                                        log::error!("Failed to create audio sink: {}", e);
                                        continue;
                                    }
                                };
                                sink.append(source);
                                sink.sleep_until_end();
                            }
                            Err(e) => {
                                log::error!("Failed to decode audio: {}", e);
                            }
                        }
                    }
                    Err(_) => break,
                }
            }

            // Keep stream alive until end
            drop(_stream);
        });

        *guard = Some(tx);
    }
    guard.clone()
}

/// Get the sounds directory path
fn get_sounds_dir() -> PathBuf {
    // Sounds are embedded in the app, but we also support custom sounds
    // First try the app resource directory
    if let Some(exe_path) = std::env::current_exe().ok() {
        let exe_dir = exe_path.parent().unwrap_or(&exe_path);
        let sounds_dir = exe_dir.join("sounds");
        if sounds_dir.exists() {
            return sounds_dir;
        }
    }

    // Fallback: create sounds dir in app config directory
    if let Some(config_dir) = dirs::config_dir() {
        let sounds_dir = config_dir.join("vibe-island").join("sounds");
        let _ = fs::create_dir_all(&sounds_dir);
        return sounds_dir;
    }

    PathBuf::from("sounds")
}

/// Play a notification sound
pub fn play_sound(sound: NotificationSound) -> Result<(), String> {
    if sound == NotificationSound::None {
        return Ok(());
    }

    let filename = sound.filename().ok_or("No filename for sound")?;
    let sounds_dir = get_sounds_dir();
    let sound_path = sounds_dir.join(filename);

    // Check if file exists
    if !sound_path.exists() {
        log::warn!("Sound file not found: {:?}", sound_path);
        return Err(format!("Sound file not found: {}", filename));
    }

    // Read the file
    let data = fs::read(&sound_path).map_err(|e| format!("Failed to read sound file: {}", e))?;

    // Send to audio thread
    if let Some(sender) = ensure_audio_thread() {
        sender
            .send(AudioCommand::Play(data))
            .map_err(|e| format!("Failed to send audio command: {}", e))?;
    }

    Ok(())
}

/// Get the list of available sounds with their display names
pub fn get_sound_list() -> Vec<(NotificationSound, String)> {
    NotificationSound::all()
        .into_iter()
        .map(|s| {
            let name = match s {
                NotificationSound::None => "None".to_string(),
                NotificationSound::Pop => "Pop".to_string(),
                NotificationSound::Ping => "Ping".to_string(),
                NotificationSound::Glass => "Glass".to_string(),
                NotificationSound::Hero => "Hero".to_string(),
                NotificationSound::Blow => "Blow".to_string(),
                NotificationSound::Bottle => "Bottle".to_string(),
                NotificationSound::Frog => "Frog".to_string(),
                NotificationSound::Funk => "Funk".to_string(),
                NotificationSound::Morse => "Morse".to_string(),
                NotificationSound::Purr => "Purr".to_string(),
                NotificationSound::Tink => "Tink".to_string(),
            };
            (s, name)
        })
        .collect()
}
