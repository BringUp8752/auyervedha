const express=require("express"),{Pool}=require("pg");
const app=express();app.use(express.json({limit:"2mb"}));app.use(express.static("public"));
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
const KEY=process.env.ADMIN_KEY;
const admin=(req,res,next)=>KEY&&req.get("x-admin-key")===KEY?next():res.status(401).json({error:"unauthorized"});
const wrap=f=>(req,res)=>f(req,res).catch(e=>{console.error(e);res.status(500).json({error:"server error"})});
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
app.post("/api/orders",wrap(async(q,r)=>{const{email,address,coupon,items}=q.body;
if(!Array.isArray(items)||!items.length)return r.status(400).json({error:"empty"});
const c=await pool.connect();try{await c.query("BEGIN");
let uid=null;if(email&&String(email).includes("@"))uid=(await c.query("INSERT INTO users(email) VALUES($1) ON CONFLICT(email) DO UPDATE SET email=EXCLUDED.email RETURNING id",[email])).rows[0].id;
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
