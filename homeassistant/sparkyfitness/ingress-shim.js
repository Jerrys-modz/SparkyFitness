// Home Assistant Ingress shim for the prebuilt SparkyFitness frontend.
//
// Loaded as a classic (blocking) script from index.html, so it runs before
// any of the app's module scripts. patch-ingress-paths.sh copies it into the
// add-on image; the SparkyFitnessFrontend source never ships it.
//
// Under Ingress the page lives at /api/hassio_ingress/<token>/ on Home
// Assistant's origin, and nginx rewrites index.html's <base href> to that
// prefix. The frontend build still requests root-absolute URLs ("/api/...",
// window.location.origin + "/api/auth", "/locales/...", "/images/...",
// "/uploads/...", Vite's "/assets/..." preloads), which would all land on
// Home Assistant itself. This shim prefixes those with the ingress path at
// the few places the browser turns a string into a request.
//
// With direct port access <base href> stays "/", the prefix is empty, and
// the shim does nothing beyond setting window.__SPARKY_BASE__ = "".
(function () {
  var base = new URL(document.baseURI).pathname.replace(/\/+$/, '');
  // Read by the patched React Router (basename) and logout redirect.
  window.__SPARKY_BASE__ = base;
  if (!base) return;

  var origin = window.location.origin;

  function fix(url) {
    if (typeof url !== 'string') return url;
    var head = '';
    var path = url;
    if (url.indexOf(origin + '/') === 0) {
      head = origin;
      path = url.slice(origin.length);
    }
    // Only root-absolute same-origin paths; leave relative, protocol-relative,
    // data:, blob: and cross-origin URLs alone.
    if (path.charAt(0) !== '/' || path.charAt(1) === '/') return url;
    if (path === base || path.indexOf(base + '/') === 0) return url;
    return head + base + path;
  }

  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string') {
      input = fix(input);
    } else if (input instanceof URL) {
      input = fix(input.href);
    } else if (input instanceof Request) {
      var fixed = fix(input.url);
      if (fixed !== input.url) input = new Request(fixed, input);
    }
    return nativeFetch.call(this, input, init);
  };

  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = fix(url instanceof URL ? url.href : String(url));
    return nativeOpen.apply(this, args);
  };

  var URL_ATTRS = { src: 1, href: 1, poster: 1, action: 1 };
  var nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (URL_ATTRS[String(name).toLowerCase()] === 1) {
      value = fix(String(value));
    }
    return nativeSetAttribute.call(this, name, value);
  };

  function wrapSetter(ctor, prop) {
    if (!ctor) return;
    var desc = Object.getOwnPropertyDescriptor(ctor.prototype, prop);
    if (!desc || !desc.set) return;
    Object.defineProperty(ctor.prototype, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set: function (value) {
        desc.set.call(this, fix(String(value)));
      },
    });
  }
  wrapSetter(window.HTMLImageElement, 'src');
  wrapSetter(window.HTMLScriptElement, 'src');
  wrapSetter(window.HTMLLinkElement, 'href');
  wrapSetter(window.HTMLAnchorElement, 'href');
  wrapSetter(window.HTMLSourceElement, 'src');
  wrapSetter(window.HTMLMediaElement, 'src');
  wrapSetter(window.HTMLVideoElement, 'poster');
})();
