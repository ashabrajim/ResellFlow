/* eslint-disable no-control-regex -- suppression volontaire des caractères de contrôle dans les textes importés */
import type { ManualProductInput } from "./product.ts";
import { normalizeImageUrl, parseLooseHttpUrl } from "./product.ts";

// Import « depuis ma page ouverte » : un petit script (bookmarklet) tourne DANS le navigateur de
// l'utilisateur, sur la page produit qu'il consulte avec sa propre session. Il copie ce qu'il voit
// (titre, images, prix, variantes s'il les trouve) dans le presse-papiers ; l'application lit ce
// texte et préremplit la fiche, que l'utilisateur vérifie. Rien n'est contourné côté plateforme.
//
// ÉTAT : les sélecteurs de variantes/prix sont des heuristiques NON VALIDÉES sur les vraies pages
// (les sites changent souvent). Tout est donc relu par l'utilisateur avant création.

/** Code exécuté dans la page. ES5 volontairement ; toute erreur interne est avalée champ par champ. */
export const EXTRACTOR_SOURCE = `(function(){
var D=document,out={v:1,url:location.href,title:'',description:'',images:[],price:null,currency:'',options:[]};
function q(s){try{return D.querySelector(s)}catch(e){return null}}
function qa(s){try{return Array.prototype.slice.call(D.querySelectorAll(s))}catch(e){return []}}
function meta(n){var e=q('meta[property="'+n+'"],meta[name="'+n+'"]');return e&&e.content?String(e.content).trim():''}
function txt(e){return e?String(e.textContent||'').replace(/\\s+/g,' ').trim():''}
function num(s){var m=String(s||'').replace(/,/g,'').match(/\\d+(?:\\.\\d{1,2})?/);return m?parseFloat(m[0]):null}
function img(u){if(!u)return;u=String(u);if(u.indexOf('//')===0)u='https:'+u;if(!/^https?:/i.test(u))return;u=u.replace(/(\\.(?:jpg|jpeg|png))_\\d+x\\d+[^./]*\\.(?:jpg|jpeg|png|webp)$/i,'$1').replace(/(\\.(?:jpg|jpeg|png))_\\.webp$/i,'$1');if(out.images.indexOf(u)<0&&out.images.length<12)out.images.push(u)}
try{qa('script[type="application/ld+json"]').forEach(function(s){var j;try{j=JSON.parse(s.textContent)}catch(e){return}
(Array.isArray(j)?j:[j]).forEach(function(p){if(!p||p['@type']!=='Product')return;
if(p.name&&!out.title)out.title=String(p.name);
if(p.description&&!out.description)out.description=String(p.description);
[].concat(p.image||[]).forEach(function(i){img(typeof i==='string'?i:i&&i.url)});
var o=[].concat(p.offers||[])[0];if(o){if(out.price===null&&o.price!==undefined)out.price=num(o.price);if(o.priceCurrency)out.currency=String(o.priceCurrency)}})})}catch(e){}
try{if(!out.title)out.title=meta('og:title')||txt(q('h1'))||D.title}catch(e){}
try{if(!out.description)out.description=meta('og:description')||meta('description')}catch(e){}
try{img(meta('og:image'))}catch(e){}
try{qa('img').forEach(function(i){var s=i.getAttribute('data-src')||i.currentSrc||i.src;var w=i.naturalWidth||i.width||0;if(s&&w>=300&&/(alicdn|aliexpress|alibaba|weidian|geilicdn|taobaocdn|tbcdn)/i.test(s))img(s)})}catch(e){}
try{if(out.price===null){out.price=num(meta('product:price:amount'));if(!out.currency)out.currency=meta('product:price:currency')}}catch(e){}
try{if(out.price===null){var ps=qa('[class*="rice"],[class*="Price"]');for(var i=0;i<ps.length&&out.price===null;i++){var n=num(txt(ps[i]));if(n&&n>0&&n<1e7)out.price=n}}}catch(e){}
try{if(!out.currency&&/(taobao|tmall|1688|weidian)/i.test(location.hostname))out.currency='CNY'}catch(e){}
try{var seen={};qa('[class*="skuItem"],[class*="sku-item"],[class*="SkuItem"],[class*="skuWrapper"],[class*="sku-wrapper"]').forEach(function(c){
var name=txt(c.querySelector('[class*="label"],[class*="Label"],[class*="title"],[class*="Title"],dt,.tb-property-type'));
var vals=[];Array.prototype.slice.call(c.querySelectorAll('[class*="valueItem"],[class*="ValueItem"],[class*="value-item"],li,dd,[data-value]')).forEach(function(v){
var t=v.getAttribute('title')||v.getAttribute('data-value')||txt(v);t=String(t).trim();if(t&&t.length<=40&&vals.indexOf(t)<0)vals.push(t)});
if(name&&vals.length&&!seen[name]){seen[name]=1;out.options.push({name:name.slice(0,40),values:vals.slice(0,60)})}})}catch(e){}
var json=JSON.stringify(out);
function fallback(){window.prompt('Copie ces données (Ctrl+C) puis colle-les dans ResellFlow :',json)}
try{navigator.clipboard.writeText(json).then(function(){alert('ResellFlow : données copiées ('+out.images.length+' image(s), '+out.options.length+' option(s)). Retourne dans ResellFlow et colle-les.')},fallback)}catch(e){fallback()}
})();`;

/** Contenu à enregistrer comme favori (URL `javascript:`). */
export function bookmarkletHref(): string {
  return `javascript:${encodeURIComponent(EXTRACTOR_SOURCE)}`;
}

export type CaptureError = "EMPTY" | "NOT_JSON" | "NOT_CAPTURE" | "BAD_URL" | "NO_TITLE";

export type CaptureResult =
  { ok: true; input: ManualProductInput } | { ok: false; code: CaptureError };

const CJK = /[㐀-鿿]/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string {
  return typeof v === "string"
    ? v
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
        .trim()
        .slice(0, max)
    : "";
}

/** Valide le texte collé (ne fait jamais confiance au contenu) et le convertit en saisie de produit. */
export function parseCapture(text: string): CaptureResult {
  const raw = text.trim();
  if (!raw) return { ok: false, code: "EMPTY" };
  if (raw.length > 400_000) return { ok: false, code: "NOT_CAPTURE" };
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return { ok: false, code: "NOT_JSON" };
  }
  if (!isRecord(d) || d["v"] !== 1) return { ok: false, code: "NOT_CAPTURE" };

  const url = parseLooseHttpUrl(str(d["url"], 2048));
  if (!url) return { ok: false, code: "BAD_URL" };
  const title = str(d["title"], 300);
  if (!title) return { ok: false, code: "NO_TITLE" };

  const images: string[] = [];
  if (Array.isArray(d["images"])) {
    for (const i of d["images"]) {
      const n = typeof i === "string" ? normalizeImageUrl(i) : null;
      if (n && !images.includes(n)) images.push(n);
      if (images.length >= 12) break;
    }
  }

  const priceRaw = d["price"];
  const price =
    typeof priceRaw === "number" &&
    Number.isFinite(priceRaw) &&
    priceRaw > 0 &&
    priceRaw <= 10_000_000
      ? priceRaw
      : null;
  const cur = str(d["currency"], 3).toUpperCase();
  const currency = /^[A-Z]{3}$/.test(cur) ? cur : "CNY";

  const options: ManualProductInput["options"] = [];
  if (Array.isArray(d["options"])) {
    for (const o of d["options"]) {
      if (!isRecord(o) || options.length >= 6) continue;
      const name = str(o["name"], 60);
      const values = Array.isArray(o["values"])
        ? [...new Set(o["values"].map((v) => str(v, 80)).filter(Boolean))].slice(0, 60)
        : [];
      if (name && values.length && !options.some((x) => x.name === name))
        options.push({ name, values });
    }
  }

  const input: ManualProductInput = {
    sourceUrl: url.href,
    title,
    price,
    currency,
    images,
    options,
  };
  if (CJK.test(title)) input.titleOriginal = title;
  const description = str(d["description"], 5000);
  if (description) input.description = description;
  return { ok: true, input };
}
