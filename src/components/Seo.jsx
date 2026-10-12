import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SITE_URL, DEFAULT_SEO, seoForPath } from "../seo";

// Route-aware SEO: unique title/description/keywords per public page,
// canonical + og:url always absolute, app pages marked noindex.
// Mount once inside <BrowserRouter>.
function setMetaName(name, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaProperty(property, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  if (!href) return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function Seo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const cfg = seoForPath(pathname) || DEFAULT_SEO;
    const url = SITE_URL ? `${SITE_URL}${pathname}` : pathname;

    document.title = cfg.title;
    setMetaName("description", cfg.description);
    setMetaName("keywords", cfg.keywords);
    setMetaName("robots", cfg.robots);
    setCanonical(url);
    setMetaProperty("og:url", url);
    setMetaProperty("og:title", cfg.title);
    setMetaProperty("og:description", cfg.description);
    setMetaName("twitter:title", cfg.title);
    setMetaName("twitter:description", cfg.description);
  }, [pathname]);

  return null;
}

export default Seo;
