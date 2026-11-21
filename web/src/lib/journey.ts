type EventName = 'visit' | 'explore' | 'builder';
type Source = 'direct' | 'email' | 'social' | 'referral';
type Visit = { id: string; source: Source; lastSeen: number };
const key = 'nami.siteVisit';
const idleLimit = 30 * 60_000;
let current: Visit | undefined;
const sent = new Set<string>();

function source(): Source {
  const medium = new URLSearchParams(location.search).get('utm_medium')?.toLowerCase();
  if (medium === 'email' || medium === 'newsletter') return 'email';
  if (medium === 'social') return 'social';
  if (document.referrer && new URL(document.referrer).origin !== location.origin) return 'referral';
  return 'direct';
}
function visit(): Visit | undefined {
  try {
    if (navigator.doNotTrack === '1' || import.meta.env.VITE_API_MODE === 'mock' ||
      new URLSearchParams(location.search).get('demo') === '1' || sessionStorage.getItem('nami.demo') === '1') return;
    const now = Date.now();
    if (!current) {
      const previous = sessionStorage.getItem(key);
      if (previous) current = JSON.parse(previous) as Visit;
    }
    if (!current?.id || now - current.lastSeen > idleLimit) {
      current = {id:crypto.randomUUID(), source:source(), lastSeen:now};
      sent.clear();
    }
    current.lastSeen = now;
    sessionStorage.setItem(key,JSON.stringify(current));
    return current;
  } catch { return; }
}
export function visitHeaders(): Record<string,string> {
  const item=visit();
  return item ? {'x-journey-id':item.id} : {};
}
export function recordEvent(event: EventName, causeId?: string) {
  const item=visit();
  if (!item) return;
  const eventKey = [item.id,event,causeId || ''].join('/');
  if (sent.has(eventKey)) return;
  sent.add(eventKey);
  void fetch('/api/events',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},
    body:JSON.stringify({event,visitId:item.id,source:item.source,...(causeId ? {causeId} : {})})
  }).then(response => {if (!response.ok) sent.delete(eventKey);}).catch(()=>sent.delete(eventKey));
}

