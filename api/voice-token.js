import {handler} from '../server.mjs';
export default function token(req,res){req.url='/api/voice-token';return handler(req,res);}
