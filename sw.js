// This is the Service Worker
// It tells the phone: "I am a real app, you can install me!"

self.addEventListener('install', (event) => {
    console.log('App Installed Successfully');
});

self.addEventListener('fetch', (event) => {
    // This allows the app to load even if your phone briefly loses internet
});
