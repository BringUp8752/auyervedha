const express=require("express"),{Pool}=require("pg");
const app=express();app.use(express.json({limit:"2mb"}));app.use(express.static("public"));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
const KEY=process.env.ADMIN_KEY;
const admin=(req,res,next)=>KEY&&req.get("x-admin-key")===KEY?next():res.status(401).json({error:"unauthorized"});
const wrap=f=>(req,res)=>f(req,res).catch(e=>{console.error(e);res.status(500).json({error:"server error"})});
/* ---------- Customer accounts: email + password, verified by an emailed OTP ---------- */
app.set("trust proxy",1);
const crypto=require("crypto");
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
const scrypt=(pw,salt)=>new Promise((ok,no)=>crypto.scrypt(pw,salt,64,(e,k)=>e?no(e):ok(k)));
const hashPw=async pw=>{const salt=crypto.randomBytes(16).toString("hex");return salt+":"+(await scrypt(pw,salt)).toString("hex")};
const checkPw=async(pw,st)=>{const[salt,h]=(st||"x:y").split(":");const k=await scrypt(pw,salt),hb=Buffer.from(h,"hex");return !!st&&hb.length===k.length&&crypto.timingSafeEqual(k,hb)};
const hits=new Map();setInterval(()=>hits.clear(),15*60*1000).unref();
const tooMany=(key,max)=>{const n=(hits.get(key)||0)+1;hits.set(key,n);return n>max};
const em=s=>String(s||"").trim().toLowerCase();
const okEmail=s=>s.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const MAILFAIL="We could not send the verification email. Please check the address and try again.";
async function sendOtpMail(email,code){
  if(!process.env.BREVO_API_KEY||!process.env.EMAIL_FROM)throw new Error("BREVO_API_KEY / EMAIL_FROM not set");
  const r=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",signal:AbortSignal.timeout(10000),
    headers:{"api-key":process.env.BREVO_API_KEY,"content-type":"application/json",accept:"application/json"},
    body:JSON.stringify({sender:{name:"Kerala Ayurveda",email:process.env.EMAIL_FROM},to:[{email}],subject:"Your Kerala Ayurveda verification code",
      htmlContent:`<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto"><h2 style="color:#2e7d32">Verify your email</h2><p>Your verification code is:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p style="color:#666">This code is valid for 10 minutes. If you did not request it, you can ignore this email.</p></div>`})});
  if(!r.ok)throw new Error("Brevo "+r.status+" "+await r.text());
}
/* returns false if a code was already sent in the last 60 seconds */
async function issueOtp(uid,email){
  if((await pool.query("SELECT 1 FROM email_otps WHERE user_id=$1 AND created_at>now()-interval '60 seconds'",[uid])).rows[0])return false;
  const code=String(crypto.randomInt(0,1000000)).padStart(6,"0");
  await pool.query(`INSERT INTO email_otps(user_id,code_hash,expires_at,attempts,created_at) VALUES($1,$2,now()+interval '10 minutes',0,now())
    ON CONFLICT(user_id) DO UPDATE SET code_hash=$2,expires_at=now()+interval '10 minutes',attempts=0,created_at=now()`,[uid,sha(code+":"+uid)]);
  try{await sendOtpMail(email,code)}catch(e){await pool.query("DELETE FROM email_otps WHERE user_id=$1",[uid]);throw e}
  return true;
}
const newSession=async uid=>{const t=crypto.randomBytes(32).toString("hex");
  await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')",[sha(t),uid]);return t};
const auth=(req,res,next)=>{const t=(req.get("authorization")||"").replace(/^Bearer /,"");
  if(!t)return res.status(401).json({error:"Please sign in"});
  pool.query("SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.email_verified",[sha(t)])
    .then(x=>{if(!x.rows[0])return res.status(401).json({error:"Please sign in"});req.user=x.rows[0];req.tok=t;next()})
    .catch(e=>{console.error(e);res.status(500).json({error:"server error"})})};

app.post("/api/auth/register",wrap(async(q,r)=>{
  if(tooMany("reg"+q.ip,10))return r.status(429).json({error:"Too many attempts. Please try again later."});
  const email=em(q.body.email),pw=String(q.body.password||""),name=String(q.body.name||"").trim().slice(0,80);
  if(!okEmail(email))return r.status(400).json({error:"Please enter a valid email address."});
  if(pw.length<8||pw.length>200)return r.status(400).json({error:"Password must be at least 8 characters."});
  const ex=(await pool.query("SELECT id,email_verified FROM users WHERE email=$1",[email])).rows[0];
  if(ex&&ex.email_verified)return r.status(409).json({error:"This email is already registered. Please sign in."});
  const h=await hashPw(pw);let uid;
  if(ex){uid=ex.id;await pool.query("UPDATE users SET name=$2,password_hash=$3 WHERE id=$1",[uid,name||null,h])}
  else uid=(await pool.query("INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id",[email,name||null,h])).rows[0].id;
  try{await issueOtp(uid,email)}catch(e){console.error(e.message);return r.status(502).json({error:MAILFAIL})}
  r.json({ok:true})}));

app.post("/api/auth/verify",wrap(async(q,r)=>{
  const email=em(q.body.email),code=String(q.body.code||"").trim();
  if(tooMany("ver"+q.ip,30)||tooMany("vem"+email,10))return r.status(429).json({error:"Too many attempts. Please try again later."});
  const u=(await pool.query("SELECT id,name,email FROM users WHERE email=$1",[email])).rows[0];
  if(!u)return r.status(400).json({error:"Incorrect code. Please check and try again."});
  const o=(await pool.query("SELECT code_hash,attempts,expires_at>now() live FROM email_otps WHERE user_id=$1",[u.id])).rows[0];
  if(!o||!o.live)return r.status(400).json({error:"This code has expired. Please request a new one."});
  if(o.attempts>=5)return r.status(429).json({error:"Too many wrong attempts. Please request a new code."});
  await pool.query("UPDATE email_otps SET attempts=attempts+1 WHERE user_id=$1",[u.id]);
  if(!/^\d{6}$/.test(code)||!crypto.timingSafeEqual(Buffer.from(sha(code+":"+u.id)),Buffer.from(o.code_hash)))
    return r.status(400).json({error:"Incorrect code. Please check and try again."});
  await pool.query("UPDATE users SET email_verified=true WHERE id=$1",[u.id]);
  await pool.query("DELETE FROM email_otps WHERE user_id=$1",[u.id]);
  r.json({token:await newSession(u.id),user:{name:u.name,email:u.email}})}));

app.post("/api/auth/resend",wrap(async(q,r)=>{
  if(tooMany("rs"+q.ip,10))return r.status(429).json({error:"Too many attempts. Please try again later."});
  const email=em(q.body.email);
  const u=(await pool.query("SELECT id,email_verified,password_hash FROM users WHERE email=$1",[email])).rows[0];
  if(u&&!u.email_verified&&u.password_hash){
    let sent;try{sent=await issueOtp(u.id,email)}catch(e){console.error(e.message);return r.status(502).json({error:MAILFAIL})}
    if(!sent)return r.status(429).json({error:"Please wait 60 seconds before requesting another code."})}
  r.json({ok:true})}));

app.post("/api/auth/login",wrap(async(q,r)=>{
  const email=em(q.body.email),pw=String(q.body.password||"").slice(0,200);
  if(tooMany("lg"+q.ip+email,10))return r.status(429).json({error:"Too many attempts. Please try again in a few minutes."});
  const u=(await pool.query("SELECT id,name,email,password_hash,email_verified FROM users WHERE email=$1",[email])).rows[0];
  if(!(await checkPw(pw,u&&u.password_hash)))return r.status(401).json({error:"Wrong email or password."});
  if(!u.email_verified){try{await issueOtp(u.id,email)}catch(e){console.error(e.message)}
    return r.status(403).json({needsVerify:true,error:"Please verify your email first. Enter the code we emailed you."})}
  r.json({token:await newSession(u.id),user:{name:u.name,email:u.email}})}));

app.post("/api/auth/logout",auth,wrap(async(q,r)=>{await pool.query("DELETE FROM sessions WHERE token_hash=$1",[sha(q.tok)]);r.json({ok:true})}));
app.get("/api/me",auth,(q,r)=>r.json({user:{name:q.user.name,email:q.user.email}}));
/* ---------- end customer accounts ---------- */
const SEL=`SELECT p.id,p.name n,c.name c,c.color col,b.name b,p.price::float p,p.image_url im,p.hidden h
FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN brands b ON b.id=p.brand_id`;
app.get("/api/products",wrap(async(q,r)=>r.json((await pool.query(SEL+" WHERE NOT p.hidden ORDER BY p.id")).rows)));
app.get("/api/admin/products",admin,wrap(async(q,r)=>r.json((await pool.query(SEL+" ORDER BY p.id")).rows)));
app.post("/api/admin/products",admin,wrap(async(q,r)=>{const{n,c,b,p,im}=q.body;
await pool.query(`INSERT INTO products(name,category_id,brand_id,price,image_url) VALUES($1,(SELECT id FROM categories WHERE name=$2),(SELECT id FROM brands WHERE name=$3),$4,$5)`,[n,c,b,p,im||null]);r.json({ok:true})}));
app.patch("/api/admin/products/:id",admin,wrap(async(q,r)=>{const{n,p,h,im,c,b}=q.body;
await pool.query(`UPDATE products SET name=COALESCE($2,name),price=COALESCE($3,price),hidden=COALESCE($4,hidden),image_url=COALESCE($5,image_url),
category_id=COALESCE((SELECT id FROM categories WHERE name=$6),category_id),brand_id=COALESCE((SELECT id FROM brands WHERE name=$7),brand_id) WHERE id=$1`,
[q.params.id,n??null,p??null,h??null,im??null,c??null,b??null]);r.json({ok:true})}));
app.delete("/api/admin/products/:id",admin,wrap(async(q,r)=>{try{await pool.query("DELETE FROM products WHERE id=$1",[q.params.id])}catch(e){await pool.query("UPDATE products SET hidden=true WHERE id=$1",[q.params.id])}r.json({ok:true})}));
app.get("/api/coupon/:code",wrap(async(q,r)=>{const x=await pool.query("SELECT percent_off pct FROM coupons WHERE code=upper($1) AND active AND (expires_at IS NULL OR expires_at>now())",[q.params.code]);
x.rows[0]?r.json(x.rows[0]):r.status(404).json({error:"invalid"})}));
app.get("/api/admin/coupons",admin,wrap(async(q,r)=>r.json((await pool.query("SELECT code,percent_off,active FROM coupons ORDER BY code")).rows)));
app.post("/api/admin/coupons",admin,wrap(async(q,r)=>{const p=+q.body.pct;if(!(p>=1&&p<=100))return r.status(400).json({error:"bad percent"});
await pool.query("INSERT INTO coupons(code,percent_off) VALUES(upper($1),$2) ON CONFLICT(code) DO UPDATE SET percent_off=$2,active=true",[q.body.code,p]);r.json({ok:true})}));
app.patch("/api/admin/coupons/:code",admin,wrap(async(q,r)=>{await pool.query("UPDATE coupons SET active=NOT active WHERE code=$1",[q.params.code]);r.json({ok:true})}));
app.delete("/api/admin/coupons/:code",admin,wrap(async(q,r)=>{try{await pool.query("DELETE FROM coupons WHERE code=$1",[q.params.code])}catch(e){await pool.query("UPDATE coupons SET active=false WHERE code=$1",[q.params.code])}r.json({ok:true})}));
app.post("/api/orders",auth,wrap(async(q,r)=>{const{address,coupon,items}=q.body;
if(!Array.isArray(items)||!items.length)return r.status(400).json({error:"empty"});
const c=await pool.connect();try{await c.query("BEGIN");
const uid=q.user.id;
let sub=0;const rows=[];for(const it of items){const qty=Math.min(100,Math.max(1,parseInt(it.q)||0));
const pr=(await c.query("SELECT id,price::float p FROM products WHERE id=$1 AND NOT hidden",[it.id])).rows[0];if(!pr)continue;sub+=pr.p*qty;rows.push([pr.id,qty,pr.p])}
if(!rows.length)throw new Error("no valid items");
let code=null,pct=0;if(coupon){const k=(await c.query("SELECT code,percent_off FROM coupons WHERE code=upper($1) AND active AND (expires_at IS NULL OR expires_at>now())",[coupon])).rows[0];if(k){code=k.code;pct=k.percent_off}}
const total=Math.round(sub*(100-pct))/100;
const o=(await c.query("INSERT INTO orders(user_id,address,coupon_code,total) VALUES($1,$2,$3,$4) RETURNING id",[uid,address||"",code,total])).rows[0];
for(const x of rows)await c.query("INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES($1,$2,$3,$4)",[o.id,...x]);
await c.query("COMMIT");r.json({id:o.id,total})}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}}));
app.get("/api/admin/orders",admin,wrap(async(q,r)=>r.json((await pool.query(`SELECT o.id,(extract(epoch from o.created_at)*1000)::float ts,u.email,o.address,o.coupon_code coupon,o.total::float total,o.status,
json_agg(json_build_object('n',p.name,'q',i.quantity)) items FROM orders o LEFT JOIN users u ON u.id=o.user_id JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id
GROUP BY o.id,u.email ORDER BY o.id DESC`)).rows)));
app.patch("/api/admin/orders/:id",admin,wrap(async(q,r)=>{await pool.query("UPDATE orders SET status=$2 WHERE id=$1",[q.params.id,q.body.status]);r.json({ok:true})}));
app.listen(process.env.PORT||3000,()=>console.log("running"));
