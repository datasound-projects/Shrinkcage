export type PublicationState='created'|'manual-review';
export type PublicationRunner=(binary:string,args:string[],options:{encoding:'utf8';shell:false;timeout:number})=>{status?:number|null;stdout?:string;stderr?:string;error?:Error};
export function publicationResult(status:number|null,stderr:string):PublicationState;
export function publishReview(branch:string,bodyFile:string,run?:PublicationRunner):{state:PublicationState;link:string};
