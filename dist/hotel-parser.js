export function parseHotel(text){
 const lines=text.split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean),out={};
 let ai=lines.findIndex(x=>/\bSingapore\b/i.test(x)&&/\d/.test(x)&&(/\bRoad\b|\bStreet\b|\bAvenue\b|\bSGP\b|\bSingapore\b/i.test(x))&&!/booking|check|Sep|Aug|INR|policy|refund/i.test(x));
 if(ai>=0){let name=lines[ai-1]||'';if(/^(Serviced Apartment|Hotel|Resort|Apartment)$/i.test(name))name=lines[ai-2]||'';if(name&&!/booking|payment|confirmed|thank you/i.test(name))out.hotelName=name.replace(/,\s*Singapore$/i,'');
 const addr=lines[ai];const a=addr.match(/^(\d+[A-Z]?)\s+(.+?)(?=\s*#|\s*,)/i);if(a){out.block=a[1];out.street=a[2].trim();}const unit=addr.match(/#(\d+)-([\dA-Z]+)/i);if(unit){out.floor=unit[1];out.unit=unit[2];}const postal=addr.match(/\b(\d{6})\b/);if(postal)out.postal=postal[1];
 const nearby=lines.slice(ai+1,ai+6).join(' '),phone=nearby.match(/\+?65[\s-]?\d{4}[\s-]?\d{4}\b/),email=nearby.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);if(phone)out.hotelPhone=phone[0];if(email)out.hotelEmail=email[0];}
 if(out.hotelName)out.building=out.hotelName;
 if(ai>=0)out.accommodation='Hotel';
 return {data:out,paymentPending:/payment[^\n]{0,60}pending|no pre-payment|remaining amount/i.test(text)};
}
