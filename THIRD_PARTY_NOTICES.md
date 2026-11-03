# Third-party notices

Geo Camera includes or depends on the following open-source software.

| Component | License | Use |
| --- | --- | --- |
| GEO-CAM logo (`assets/images/geo-cam-logo-source.png` and assets generated from it) | Project artwork supplied by the developer (8BITBANNAR) | App icon, splash, in-app branding, stamp badge |
| OpenStreetMap map data and standard tiles | Data © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright); tiles under the [OSMF tile policy](https://operations.osmfoundation.org/policies/tiles/) | Mini map in the stamp; credited on every map |
| [Inter](https://rsms.me/inter/) typeface by Rasmus Andersson | SIL Open Font License 1.1 (full text: `assets/fonts/Inter-LICENSE.txt`) | Stamp text, bundled as `Inter-Regular.ttf` / `Inter-SemiBold.ttf` |
| React, React Native | MIT | UI framework |
| Expo SDK 57 (expo, expo-router, expo-camera, expo-location, expo-media-library, expo-file-system, expo-video, expo-image, expo-sharing, expo-localization, …) | MIT | Platform modules |
| @shopify/react-native-skia | MIT | Stamp rendering, photo compositing |
| @react-native-async-storage/async-storage | MIT | Local settings |
| @react-native-community/slider | MIT | Settings sliders |
| react-native-gesture-handler, react-native-screens, react-native-safe-area-context | MIT | Gestures, navigation, safe areas |
| @expo/vector-icons (Ionicons) | MIT | Icons |
| AndroidX Media3 (transformer, effect, common) | Apache License 2.0 | Android video stamping |
| Apple AVFoundation / Core Image | System frameworks | iOS video stamping |

The complete dependency tree and each package's license file are in
`node_modules/`; `npx license-checker --summary` lists them.
