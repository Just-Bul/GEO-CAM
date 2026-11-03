import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

import { logError } from '../../utils/errors';
import { STAMP_FONT_FAMILY, type StampFonts } from './stampRenderer';

const FONT_MODULES = [
  require('../../../assets/fonts/Inter-Regular.ttf'),
  require('../../../assets/fonts/Inter-SemiBold.ttf'),
];

let fontsPromise: Promise<StampFonts> | null = null;
let loadedFonts: StampFonts | null = null;

/**
 * Loads the bundled Inter font once. Characters Inter lacks (Bengali, Arabic,
 * CJK, emoji flags...) fall back to the system fonts automatically.
 */
export function loadStampFonts(): Promise<StampFonts> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const provider = Skia.TypefaceFontProvider.Make();
      for (const module of FONT_MODULES) {
        const data = await Skia.Data.fromURI(Image.resolveAssetSource(module).uri);
        const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
        if (typeface) provider.registerFont(typeface, STAMP_FONT_FAMILY);
      }
      loadedFonts = { provider, family: STAMP_FONT_FAMILY };
      return loadedFonts;
    })().catch((error) => {
      fontsPromise = null;
      logError('loadStampFonts', error);
      throw error;
    });
  }
  return fontsPromise;
}

export function useStampFonts(): StampFonts | null {
  const [fonts, setFonts] = useState<StampFonts | null>(loadedFonts);
  useEffect(() => {
    if (fonts) return;
    let active = true;
    loadStampFonts()
      .then((loaded) => active && setFonts(loaded))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [fonts]);
  return fonts;
}

const LOGO_MODULE = require('../../../assets/images/logo-emblem.png');
let logoPromise: Promise<SkImage | null> | null = null;
let loadedLogo: SkImage | null = null;

/** GEO-CAM emblem used in the stamp badge. Resolves to null if it cannot be decoded. */
export function loadStampLogo(): Promise<SkImage | null> {
  if (!logoPromise) {
    logoPromise = Skia.Data.fromURI(Image.resolveAssetSource(LOGO_MODULE).uri)
      .then((data) => {
        loadedLogo = Skia.Image.MakeImageFromEncoded(data);
        return loadedLogo;
      })
      .catch((error) => {
        logoPromise = null;
        logError('loadStampLogo', error);
        return null;
      });
  }
  return logoPromise;
}

export function useStampLogo(): SkImage | null {
  const [logo, setLogo] = useState<SkImage | null>(loadedLogo);
  useEffect(() => {
    if (logo) return;
    let active = true;
    loadStampLogo().then((image) => active && setLogo(image));
    return () => {
      active = false;
    };
  }, [logo]);
  return logo;
}
