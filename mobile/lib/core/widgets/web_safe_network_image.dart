import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Network image that is resilient on Flutter Web.
///
/// Flutter normally fetches image bytes, which can fail for cross-origin resources.
/// With [WebHtmlElementStrategy.fallback], the web renderer automatically retries by
/// displaying the image through an HTML element when the byte fetch fails. This also
/// prevents store/menu images from turning into error placeholders after list items
/// are disposed and rebuilt while scrolling.
///
/// On Android/iOS the strategy is ignored and Image.network uses the normal cached
/// image pipeline.
class WebSafeNetworkImage extends StatelessWidget {
  final String url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final int? cacheWidth;
  final WidgetBuilder? placeholderBuilder;
  final WidgetBuilder? errorBuilder;

  const WebSafeNetworkImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.cover,
    this.cacheWidth,
    this.placeholderBuilder,
    this.errorBuilder,
  });

  @override
  Widget build(BuildContext context) {
    // Keep Flutter Web's HTML fallback for cross-origin images. On mobile,
    // CachedNetworkImage gives us a persistent disk cache so list items that
    // are disposed/rebuilt while scrolling do not refetch and briefly vanish.
    if (kIsWeb) {
      return Image.network(
        url,
        key: ValueKey(url),
        width: width,
        height: height,
        fit: fit,
        cacheWidth: cacheWidth,
        gaplessPlayback: true,
        webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
        loadingBuilder: placeholderBuilder == null
            ? null
            : (context, child, progress) =>
                progress == null ? child : placeholderBuilder!(context),
        errorBuilder: errorBuilder == null
            ? null
            : (context, error, stackTrace) => errorBuilder!(context),
      );
    }

    return CachedNetworkImage(
      imageUrl: url,
      key: ValueKey(url),
      width: width,
      height: height,
      fit: fit,
      memCacheWidth: cacheWidth,
      fadeInDuration: Duration.zero,
      fadeOutDuration: Duration.zero,
      placeholder: placeholderBuilder == null
          ? null
          : (context, _) => placeholderBuilder!(context),
      errorWidget: errorBuilder == null
          ? null
          : (context, _, __) => errorBuilder!(context),
    );
  }
}
