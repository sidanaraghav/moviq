/**
 * Centralized Branding Configuration for Moviq
 * To change the app name, branding, or export defaults in the future,
 * simply edit the values in this single file.
 */
export const BRAND = {
  // Brand name displayed in UI
  name: 'Moviq',
  shortName: 'Moviq',
  displayName: 'Moviq',
  headerLogo: 'Moviq',

  // Tagline & Descriptions
  tagline: 'Audio & Video Medley Maker for Dance Performances',
  metaTitle: 'Moviq — Audio & Video Medley Maker',
  metaDescription: 'Effortlessly trim, sequence, and blend video and audio tracks for dance performances and parties with Moviq.',

  // Default export filenames
  exportVideoName: 'moviq_video.mp4',
  exportAudioName: 'moviq_audio.mp3',

  // Storage Keys for session persistence (IndexedDB & LocalStorage)
  sessionKey: 'moviq_session_v1',
  dbName: 'MoviqMediaDB',
  legacyDbNames: ['CozicutMediaDB'],
  legacySessionKeys: ['cozicut_session_v1'],
};
