// Waghmare Digital Solutions — frontend
// 1) Paste your Supabase project URL and publishable/anon key below.
// 2) Never put a service_role key or admin password in this file.
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
const UPI_ID = "8329461513@axl";
const BUSINESS_NAME = "Waghmare Digital Solutions";
const STORAGE_BUCKET = "project-files";

const configured = SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_");
const db = configured && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const $ = (id) => document.getElementById(id);
const dialogs = ["authDialog","orderDialog","accountDialog","paymentDialog","adminDialog"];
let authMode = "signin";
let activePaymentOrder = null;

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3500);
}
function openDialog(id) { $(id).showModal(); }
function closeDialog(id) { $(id).close(); }
function requireBackend() {
  if (!db) { toast("Connect Supabase first. See SETUP.md."); return false; }
  return true;
}
function money(value) {
  return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(value||0));
}
function statusLabel(s) { return (s||"submitted").replaceAll("_"," "); }
function safeText(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function showAuth(mode="signin") {
  authMode = mode;
  $("authTitle").textContent = mode === "signup" ? "Create your account." : "Welcome back.";
  $("authSubtitle").textContent = mode === "signup" ? "Create an account to submit and track projects." : "Sign in to manage your projects.";
  $("authSubmit").textContent = mode === "signup" ? "Create account" : "Sign in";
  $("authPassword").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("authSwitch").innerHTML = mode === "signup"
    ? 'Already registered? <button type="button" id="showSignin">Sign in</button>'
    : 'New here? <button type="button" id="showSignup">Create an account</button>';
  $("showSignup")?.addEventListener("click",()=>showAuth("signup"));
  $("showSignin")?.addEventListener("click",()=>showAuth("signin"));
  openDialog("authDialog");
}
async function currentUser() {
  if (!db) return null;
  const {data:{session}} = await db.auth.getSession();
  return session?.user || null;
}
async function requireUser() {
  if (!requireBackend()) return null;
  const user = await currentUser();
  if (!user) { showAuth("signin"); toast("Sign in to continue."); return null; }
  return user;
}
function openOrder(service="") {
  if (service) $("orderService").value = service;
  openDialog("orderDialog");
}
async function uploadOrderFiles(user, orderId, filesList) {
  const urls = [];
  for (const file of filesList) {
    if (file.size > 10*1024*1024) throw new Error(`${file.name} is over 10 MB.`);
    const clean = file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    const path = `${user.id}/${orderId}/${Date.now()}-${clean}`;
    const {error} = await db.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:false});
    if (error) throw error;
    urls.push(path);
  }
  return urls;
}

document.addEventListener("DOMContentLoaded", () => {
  $("year").textContent = new Date().getFullYear();
  $("mobileMenu").addEventListener("click",()=>$("navLinks").classList.toggle("open"));
  $("openAuth").addEventListener("click",()=>showAuth("signin"));
  $("footerAccount").addEventListener("click",e=>{e.preventDefault();openAccount();});
  $("footerAdmin").addEventListener("click",e=>{e.preventDefault();openAdmin();});
  ["startProject","heroOrder","ctaOrder"].forEach(id=>$(id).addEventListener("click",()=>openOrder()));
  document.querySelectorAll("[data-service]").forEach(btn=>btn.addEventListener("click",()=>openOrder(btn.dataset.service)));
  $("authForm").addEventListener("submit",handleAuth);
  $("orderForm").addEventListener("submit",handleOrder);
  $("signOut").addEventListener("click",signOut);
  $("adminLoginForm").addEventListener("submit",adminLogin);
  $("adminSignOut").addEventListener("click",signOut);
  $("refreshAdmin").addEventListener("click",loadAdminOrders);
  $("paymentForm").addEventListener("submit",submitPayment);
  $("copyUpi").addEventListener("click",async()=>{await navigator.clipboard.writeText(UPI_ID);toast("UPI ID copied.");});
  $("serviceGrid").addEventListener("click",e=>{const b=e.target.closest("[data-service]");if(b)openOrder(b.dataset.service);});
  if (!configured) console.info("Supabase is not configured. Add project credentials in app.js.");
});

async function handleAuth(e) {
  e.preventDefault(); if (!requireBackend()) return;
  const email = $("authEmail").value.trim(), password = $("authPassword").value;
  const result = authMode === "signup"
    ? await db.auth.signUp({email,password})
    : await db.auth.signInWithPassword({email,password});
  if (result.error) return toast(result.error.message);
  if (authMode === "signup" && !result.data.session) {
    toast("Account created. Check your email to confirm, then sign in.");
  } else {
    toast("Signed in successfully."); closeDialog("authDialog");
  }
}
async function handleOrder(e) {
  e.preventDefault(); const user = await requireUser(); if (!user) return;
  const payload = {
    user_id:user.id, service:$("orderService").value,
    customer_name:$("customerName").value.trim(),
    customer_phone:$("customerPhone").value.trim(),
    customer_email:$("customerEmail").value.trim(),
    details:$("orderDetails").value.trim(), status:"submitted"
  };
  const {data,error} = await db.from("orders").insert(payload).select().single();
  if (error) return toast(error.message);
  try {
    const selected = [...$("orderFiles").files];
    if (selected.length) {
      const paths = await uploadOrderFiles(user,data.id,selected);
      const {error:fileError} = await db.from("order_files").insert(paths.map(path=>({order_id:data.id,user_id:user.id,storage_path:path})));
      if (fileError) throw fileError;
    }
  } catch(err) { toast("Order saved, but file upload failed: "+err.message); }
  $("orderForm").reset(); closeDialog("orderDialog"); toast("Project request submitted.");
  openAccount(); loadCustomerOrders();
}
async function openAccount() {
  const user = await requireUser(); if (!user) return;
  $("accountEmail").textContent = user.email || "";
  openDialog("accountDialog"); loadCustomerOrders();
}
async function loadCustomerOrders() {
  const user = await currentUser(); if (!user) return;
  const {data,error} = await db.from("orders").select("*").eq("user_id",user.id).order("created_at",{ascending:false});
  if (error) { $("customerOrders").innerHTML = `<p class="muted">${safeText(error.message)}</p>`; return; }
  if (!data.length) { $("customerOrders").innerHTML='<p class="muted">No project requests yet. Start your first project from the Services section.</p>'; return; }
  $("customerOrders").innerHTML = data.map(o=>`
    <article class="order-item"><div class="order-head"><h3>${safeText(o.service)}</h3><span class="status ${safeText(o.status)}">${safeText(statusLabel(o.status))}</span></div>
    <p>Order #${safeText(o.id.slice(0,8))} · ${new Date(o.created_at).toLocaleDateString("en-IN")}<br>${safeText(o.details)}</p>
    <div class="order-head"><span class="muted">Quoted amount: <b>${o.quoted_amount==null?"Awaiting quote":money(o.quoted_amount)}</b></span>
    ${o.quoted_amount!=null && ["quoted","payment_pending"].includes(o.status) ? `<button class="btn btn-primary btn-small" data-pay="${o.id}" data-amount="${o.quoted_amount}">Payment details</button>`:""}</div></article>`).join("");
  $("customerOrders").querySelectorAll("[data-pay]").forEach(b=>b.addEventListener("click",()=>openPayment(b.dataset.pay,Number(b.dataset.amount))));
}
function openPayment(orderId,amount) {
  activePaymentOrder=orderId; $("paymentOrderId").value=orderId; $("payAmount").textContent=money(amount);
  $("upiText").textContent=UPI_ID; $("upiQr").innerHTML="";
  const uri=`upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(BUSINESS_NAME)}&am=${encodeURIComponent(amount.toFixed(2))}&cu=INR&tn=${encodeURIComponent("WDS order "+orderId.slice(0,8))}`;
  if (window.QRCode) new QRCode($("upiQr"),{text:uri,width:160,height:160,colorDark:"#07111f",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
  openDialog("paymentDialog");
}
async function submitPayment(e) {
  e.preventDefault(); const user=await requireUser(); if(!user)return;
  const {error}=await db.from("payments").insert({
    order_id:$("paymentOrderId").value,user_id:user.id,
    upi_reference:$("paymentReference").value.trim(),
    note:$("paymentNote").value.trim()||null,status:"submitted"
  });
  if(error)return toast(error.message);
  $("paymentForm").reset();closeDialog("paymentDialog");toast("Payment reference submitted for admin verification.");loadCustomerOrders();
}
async function openAdmin() {
  if(!requireBackend())return;
  $("adminLoginView").hidden=false;$("adminDashboard").hidden=true;openDialog("adminDialog");
  const user=await currentUser(); if(user) await checkAdminAndLoad();
}
async function adminLogin(e) {
  e.preventDefault();if(!requireBackend())return;
  const {error}=await db.auth.signInWithPassword({email:$("adminEmail").value.trim(),password:$("adminPassword").value});
  if(error)return toast(error.message);
  await checkAdminAndLoad();
}
async function isAdmin() {
  const user=await currentUser();if(!user)return false;
  const {data,error}=await db.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
  return !error && !!data;
}
async function checkAdminAndLoad() {
  if(!await isAdmin()){await db.auth.signOut();toast("This account is not authorised as an administrator.");return;}
  $("adminLoginView").hidden=true;$("adminDashboard").hidden=false;await loadAdminOrders();
}
async function loadAdminOrders() {
  if(!await isAdmin())return;
  const {data,error}=await db.from("orders").select("*,payments(id,upi_reference,note,status,created_at)").order("created_at",{ascending:false});
  if(error){$("adminOrders").innerHTML=`<p class="muted">${safeText(error.message)}</p>`;return;}
  const total=data.reduce((n,o)=>n+Number(o.quoted_amount||0),0);
  $("adminStats").innerHTML=`<div class="stat"><b>${data.length}</b><span>Total requests</span></div><div class="stat"><b>${data.filter(o=>o.status==="submitted").length}</b><span>New requests</span></div><div class="stat"><b>${money(total)}</b><span>Quoted value</span></div>`;
  if(!data.length){$("adminOrders").innerHTML='<p class="muted">No orders received yet.</p>';return;}
  $("adminOrders").innerHTML=data.map(o=>`
    <article class="order-item" data-order="${o.id}"><div class="order-head"><h3>${safeText(o.service)} · ${safeText(o.customer_name)}</h3><span class="status ${safeText(o.status)}">${safeText(statusLabel(o.status))}</span></div>
    <p>Order #${safeText(o.id.slice(0,8))} · ${new Date(o.created_at).toLocaleString("en-IN")}<br>${safeText(o.customer_email)} · ${safeText(o.customer_phone)}<br>${safeText(o.details)}</p>
    <div class="order-actions"><input class="quote-input" type="number" min="1" step="1" placeholder="Quote ₹" value="${o.quoted_amount??""}"><select class="status-select"><option value="submitted">Submitted</option><option value="reviewing">Reviewing</option><option value="quoted">Quoted</option><option value="payment_pending">Payment pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="rejected">Rejected</option></select><button class="btn btn-primary btn-small save-order">Save</button></div>
    ${(o.payments||[]).map(p=>`<p>Payment reference: <b>${safeText(p.upi_reference)}</b> · ${safeText(p.status)} <button class="btn btn-ghost btn-small verify-payment" data-payment="${p.id}">Mark verified</button></p>`).join("")}
    </article>`).join("");
  data.forEach(o=>{
    const card=$(`adminOrders`).querySelector(`[data-order="${o.id}"]`);
    card.querySelector(".status-select").value=o.status;
    card.querySelector(".save-order").addEventListener("click",async()=>{
      const amount=card.querySelector(".quote-input").value;
      const status=card.querySelector(".status-select").value;
      const {error}=await db.from("orders").update({quoted_amount:amount?Number(amount):null,status}).eq("id",o.id);
      if(error)toast(error.message);else{toast("Order updated.");loadAdminOrders();}
    });
  });
  $("adminOrders").querySelectorAll(".verify-payment").forEach(b=>b.addEventListener("click",async()=>{
    const {error}=await db.from("payments").update({status:"verified"}).eq("id",b.dataset.payment);
    if(error)toast(error.message);else{toast("Payment marked verified.");loadAdminOrders();}
  }));
}
async function signOut() {
  if(!db)return;const {error}=await db.auth.signOut();
  if(error)return toast(error.message);
  dialogs.forEach(id=>{if($(id).open)closeDialog(id);});toast("Signed out.");
}
