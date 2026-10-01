/** MediaDevices does not expose whether an input is built in, so match known device labels. */
const BUILT_IN_LABEL = /\b(?:built[- ]?in|internal|integrated|macbook|imac|microphone array)\b/i;
const EXTERNAL_LABEL = /\b(?:iphone|ipad|airpods|bluetooth|usb|headset|headphones|webcam|external|continuity)\b/i;

export function builtInMicrophone(devices: MediaDeviceInfo[]): MediaDeviceInfo | undefined {
  return devices.find((device) =>
    device.kind === 'audioinput' && device.deviceId &&
    device.deviceId !== 'default' && device.deviceId !== 'communications' &&
    BUILT_IN_LABEL.test(device.label) && !EXTERNAL_LABEL.test(device.label)
  );
}

/** Select a built-in mic when requested; otherwise use the OS default input. */
export async function getMicrophoneStream(builtInOnly: boolean): Promise<MediaStream> {
  if (!builtInOnly) return navigator.mediaDevices.getUserMedia({ audio: true, video: false });

  let devices = await navigator.mediaDevices.enumerateDevices();
  if (!builtInMicrophone(devices)) {
    // Device labels may be hidden until this origin has captured audio once.
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    permissionStream.getTracks().forEach((track) => track.stop());
    devices = await navigator.mediaDevices.enumerateDevices();
  }

  const mic = builtInMicrophone(devices);
  if (!mic) {
    throw new Error('No built-in microphone found. Turn off “Use this device’s microphone only” to use the system default.');
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: mic.deviceId } },
    video: false
  });
}
