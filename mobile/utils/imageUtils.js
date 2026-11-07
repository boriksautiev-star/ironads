import { Image } from 'react-native';
import { View } from 'react-native';

const BASE_URL = 'https://ironads.ru';

export const getImageUrl = (item) => {
  let url = null;
  if (item?.first_media?.file_path) {
    url = item.first_media.file_path;
  } else if (item?.first_photo) {
    url = item.first_photo;
  } else if (item?.media?.length > 0 && item.media[0]?.file_path) {
    url = item.media[0].file_path;
  }
  if (url) {
    return url.startsWith('http') ? url : BASE_URL + url;
  }
  return null;
};

export const CachedImage = ({ source, style, resizeMode = 'cover', ...props }) => {
  if (!source || !source.uri) {
    return <View style={[style, { backgroundColor: '#e5e5ea' }]} />;
  }
  return (
    <Image
      style={style}
      source={source}
      resizeMode={resizeMode}
      {...props}
    />
  );
};