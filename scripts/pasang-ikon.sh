#!/usr/bin/env bash
# Mengganti ikon & layar pembuka bawaan Capacitor dengan ikon Skrining Gizi
set -e
RES=android/app/src/main/res
rm -rf "$RES/mipmap-anydpi-v26"
cp -r resources/android/* "$RES/"
find "$RES" -name 'splash.png' -exec cp resources/splash.png {} \;
