/**
 * Image với URL có thể cần JWT (serve-local ?access_token=).
 */
import React, { useEffect, useState } from 'react';
import { Image, type ImageProps, type ImageStyle, type StyleProp, View } from 'react-native';
import { resolveFileAccessUrl } from '../lib/remoteFile';
import { useColors } from '../theme';

type Props = Omit<ImageProps, 'source'> & {
  rawUrl?: string | null;
  style?: StyleProp<ImageStyle>;
};

export default function AuthRemoteImage({ rawUrl, style, ...rest }: Props) {
  const Colors = useColors();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    void (async () => {
      const next = await resolveFileAccessUrl(rawUrl);
      if (!cancelled) setUri(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rawUrl]);

  if (!uri) {
    return <View style={[{ backgroundColor: Colors.surfaceSoft }, style]} />;
  }
  return <Image {...rest} source={{ uri }} style={style} />;
}
