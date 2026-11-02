export const defaultHotelDetails=Object.freeze({hotelName:'HOTEL BOSS',hotelEmail:'CONTACT@HOTELBOSS.SG',accommodation:'Hotel',block:'500',street:'JALAN SULTAN',postal:'199020',building:'HOTEL BOSS',localName:'HOTEL BOSS',localEmail:'CONTACT@HOTELBOSS.SG',localRelation:'HOTEL'});
export function defaultHotelPatch(current,{visitType='Tourism',hasHotelFile=false}={}){
 if(hasHotelFile)return {};
 if(current.accommodation&&current.accommodation!=='Hotel')return {};
 if(['Family Visit','Friend Visit'].includes(visitType)&&current.accommodation!=='Hotel')return {};
 if(['hotelName','hotelEmail','block','street','postal','building'].some(k=>current[k]&&String(current[k]).toUpperCase()!==defaultHotelDetails[k]))return {};
 return Object.fromEntries(Object.entries(defaultHotelDetails).filter(([key])=>!current[key]));
}
