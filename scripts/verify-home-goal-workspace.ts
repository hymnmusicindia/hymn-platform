import { chromium, expect } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { homeGoals, homeFeedSections } from "../lib/home-goals";
import type { OnboardingAgentState } from "../lib/onboarding-agent";

const directory = "app/home-goal-audit-preview";
const base = process.env.WORKSPACE_PREVIEW_URL || "http://localhost:3015";
const route = "/home-goal-audit-preview";
async function main() {
  if (existsSync(directory)) throw new Error("Preview already exists");
  mkdirSync(directory); mkdirSync(`${directory}/destination`);
  mkdirSync(".cache/home-goal", { recursive:true });
  writeFileSync(`${directory}/layout.tsx`, `import {SiteHeader} from "@/components/site-header";import {LandingWorkspace} from "@/components/landing-workspace";import {WorkspaceGoalGuide} from "@/components/workspace-goal-guide";
export default function Layout({children}:{children:React.ReactNode}){return <div className="hymn-landing"><SiteHeader user={{sub:900,email:"preview@example.com",name:"Preview Artist",role:"customer"}}/><LandingWorkspace workspaceHref="/dashboard">{children}<nav aria-label="Preview tool"><a href="${route}/destination" data-guide-route="${route}/destination">Open preview tool</a></nav></LandingWorkspace><WorkspaceGoalGuide userId={900}/></div>}`);
  writeFileSync(`${directory}/page.tsx`, `import {HomeGoalWorkspace} from "@/components/home-goal-workspace";import {buildHomePathBanners} from "@/components/home-path-banners";export default function Page(){return <main><HomeGoalWorkspace userId={900} name="Preview Artist" banners={buildHomePathBanners({catalog:[],featuredReleases:[{id:1,title:"Preview release",artistName:"Preview Artist",artworkUrl:"/home-hero-crowd.jpg",releaseType:"single",status:"live"}],signedIn:true})}/></main>}`);
  writeFileSync(`${directory}/destination/page.tsx`, `import Link from "next/link";export default function Page(){return <main style={{padding:40}}><h1>Prepare your project</h1><p>Your project tool is ready.</p><Link href="${route}">Back to your path</Link></main>}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ reducedMotion:"reduce" });
    const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
    let saved:OnboardingAgentState|null=null;
    let savedProfession="";
    let failProfession=false;
    await page.route("**/api/user/onboarding-preferences", async route => {
      if(route.request().method()==="PATCH") { if(failProfession) return route.fulfill({status:503,json:{error:"Unavailable"}}); savedProfession=route.request().postDataJSON().onboardingUserType; return route.fulfill({json:{success:true}}); }
      return route.fulfill({json:{preferences:{onboardingUserType:savedProfession}}});
    });
    let failLoad=false, failSave=false;
    let writes=0;
    await page.route("**/api/onboarding-agent",async request=>{
      if(request.request().method()==="GET") return request.fulfill({status:failLoad ? 503 : 200,contentType:"application/json",body:JSON.stringify({state:saved,goalOptions:homeGoals.map(goal=>({id:goal.id,label:goal.title})),goalLimit:140,knownGoalId:"release"})});
      const body=request.request().postDataJSON();writes++;
      if(failSave) return request.fulfill({status:429,contentType:"application/json",body:JSON.stringify({error:"You can create another path in 5 minutes."})});
      if(body.action==="step" && saved) {
        saved={...saved,plan:{...saved.plan,steps:saved.plan.steps.map(step=>step.id===body.stepId ? {...step,status:body.status} : step)}};
        if(saved.plan.steps.every(step=>["completed","skipped"].includes(step.status))) saved.status="completed";
      } else saved={version:1,goal:body.customGoal || homeGoals.find(goal=>goal.id===body.goalId)?.title || "My music",goalId:body.goalId,status:"active",generatedAt:new Date().toISOString(),plan:{welcome_message:"Welcome, Preview.",summary:"Your next steps, shaped around your objective.",primary_cta:{label:"Open tool",action:`${route}/destination`},fallback_message:"",steps:[{id:"prepare",title:"Prepare your project",description:"Gather your music and project details.",why_it_matters:"Good preparation keeps your project moving.",action_label:"Open tool",action_target:`${route}/destination`,status:"not_started",priority:"high"},{id:"follow",title:"Follow your progress",description:"Review your next project update.",why_it_matters:"Stay in control of your next step.",action_label:"Open tool",action_target:`${route}/destination`,status:"not_started",priority:"medium"}]}};
      return request.fulfill({status:200,contentType:"application/json",body:JSON.stringify({state:saved})});
    });
    for(const width of [1440,390,320]) {
      await page.setViewportSize({width,height:900});
      for(const goal of homeGoals) {
        console.log(`Checking ${goal.id} at ${width}px`);
        saved=null; savedProfession="";
        await page.goto(base+route,{timeout:120000,waitUntil:"domcontentloaded"});
        await expect(page.getByRole("heading",{name:"Your role in music?"})).toBeVisible();
        await expect(page.getByRole("group",{name:"Choose your profession"}).getByRole("button")).toHaveCount(4);
        if(goal.id==="release") await page.screenshot({path:`.cache/home-goal/profession-${width}.png`});
        if(goal.id==="release" && width===1440) {
          failProfession=true;
          await page.getByRole("button",{name:"Artist",exact:true}).click();
          await expect(page.locator(".home-goal-error")).toContainText("save your profession");
          await expect(page.getByRole("heading",{name:"Your role in music?"})).toBeVisible();
          failProfession=false;
        }
        await page.getByRole("button",{name:goal.id==="sell-beats" ? "Producer" : goal.id==="finish-release" ? "Manager" : goal.id==="studio" ? "Music Engineer" : "Artist",exact:true}).click();
        await expect(page.getByRole("heading",{name:"What brings you to HYMN?"})).toBeVisible();
        expect(await page.getByRole("group",{name:"Choose your main objective"}).getByRole("button").count()).toBeLessThanOrEqual(3);
        await expect(page.locator(".home-goal-backdrop img")).toHaveAttribute("src", /home-hero-crowd/);
        if(goal.id==="release") await page.screenshot({path:`.cache/home-goal/chooser-${width}.png`});
        const choice=page.getByRole("button",{name:new RegExp(goal.title.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"))});
        await choice.click();await expect(choice).toHaveAttribute("aria-pressed","true");
        await page.getByRole("button",{name:"Build my path"}).click();
        await expect(page.locator(".home-goal-workspace")).toHaveAttribute("data-home-goal",goal.id);
        await expect(page.getByRole("heading",{name:goal.headline})).toBeVisible();
        await expect(page.locator(".landing-hero")).toHaveCount(0);
        await expect(page.locator(".onboarding-agent-dock")).toHaveCount(0);
        await expect(page.locator(".home-goal-workspace")).toHaveAttribute("data-mode","home");
        await expect(page.locator(".home-path-guide")).not.toHaveAttribute("open","");
        const expected = homeFeedSections(goal.id,0).sort();
        expect((await page.locator("[data-home-banner]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-home-banner")))).sort()).toEqual(expected);
        const orderBefore = await page.locator("[data-home-banner]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-home-banner")));
        await page.reload();
        await expect(page.locator(".home-goal-workspace")).toHaveAttribute("data-mode","home");
        await expect.poll(async()=>JSON.stringify(await page.locator("[data-home-banner]").evaluateAll(nodes=>nodes.map(node=>node.getAttribute("data-home-banner"))))).not.toBe(JSON.stringify(orderBefore));
        expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        if(goal.id==="release") {
          await page.screenshot({path:`.cache/home-goal/release-${width}.png`});
          await page.locator(".home-path-guide > summary").click();
          const previousWrites=writes;
          await page.getByRole("button",{name:"Guide me there"}).click();
          await expect(page.getByRole("region",{name:"Guided path"})).toBeVisible();
          await expect(page.locator(".home-goal-guide-ring")).toBeVisible();
          if(width >= 1024) await page.getByRole("link",{name:"Open preview tool",exact:true}).click();
          else await page.getByRole("region",{name:"Guided path"}).getByRole("button",{name:"Open directly"}).click();
          await expect(page).toHaveURL(base+route+"/destination",{timeout:90000});
          await expect(page.getByText("YOU'RE IN THE RIGHT PLACE",{exact:true})).toBeVisible();
          expect(writes).toBe(previousWrites);
          await page.getByRole("button",{name:"Got it. Let's do this"}).click();
          await expect(page.locator(".home-goal-guide-layer")).toHaveCount(0);
          await page.getByRole("link",{name:"Back to your path"}).click();
          await expect(page.locator(".home-goal-workspace")).toHaveAttribute("data-home-goal","release");
          await page.locator(".home-path-guide > summary").click();
          await page.getByRole("button",{name:"Mark done",exact:true}).first().click();
          await expect(page.getByRole("progressbar",{name:"Your path progress"})).toHaveAttribute("aria-valuenow","1");
          await expect(page.locator(".home-goal-feature h2")).toHaveText("Follow your progress");
          await page.reload();
          await page.locator(".home-path-guide > summary").click();
          await expect(page.getByRole("progressbar",{name:"Your path progress"})).toHaveAttribute("aria-valuenow","1");
          await page.getByRole("button",{name:"Skip",exact:true}).click();
          await expect(page.locator(".home-goal-feature h2")).toHaveText("Your path is complete. Keep creating.");
          await page.getByRole("button",{name:"Change goal"}).click();
          await expect(page.getByRole("heading",{name:"What brings you to HYMN?"})).toBeVisible();
        }
      }
    }
    await page.setViewportSize({width:1440,height:900});saved=null;failLoad=true;
    await page.goto(base+route);await expect(page.getByRole("button",{name:"Retry",exact:true})).toBeVisible();
    failLoad=false;await page.getByRole("button",{name:"Retry",exact:true}).click();
    await expect(page.getByRole("heading",{name:"What brings you to HYMN?"})).toBeVisible();
    await page.getByRole("button",{name:/Release my music/}).click();
    failSave=true;await page.getByRole("button",{name:"Build my path"}).click();
    await expect(page.locator(".home-goal-error")).toContainText("5 minutes");
    await expect(page.getByRole("button",{name:"Build my path"})).toBeEnabled();
    failSave=false;await page.getByRole("button",{name:"Build my path"}).click();
    await expect(page.locator(".home-goal-workspace")).toHaveAttribute("data-home-goal","release");
    for(const guideWidth of [1440,390,320]) {
    await page.setViewportSize({width:guideWidth,height:900});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("hymn-start-goal-guide",{detail:{userId:900,goalId:"release",title:"Start a release",description:"Prepare your next release.",href:"/distribution/start",phase:"navigation"}})));
    await expect(page.locator('.landing-rail a[data-guide-route="/distribution/start"]')).toBeFocused();
    await page.screenshot({path:".cache/home-goal/navigation-guide.png"});
    await page.keyboard.press("Escape");await expect(page.locator(".home-goal-guide-layer")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    console.log("Home onboarding passed: profession-first choices, limited goals, account persistence, completion/skip, personalized recommendations, real navigation highlight, cross-route guide, errors, and three responsive widths.");
  } finally {
    await browser.close();
    unlinkSync(`${directory}/destination/page.tsx`);rmdirSync(`${directory}/destination`);
    unlinkSync(`${directory}/page.tsx`);unlinkSync(`${directory}/layout.tsx`);rmdirSync(directory);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
