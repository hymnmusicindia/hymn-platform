"use client";
import {useState} from 'react';
import {CallServicePrices} from './call-service-prices';
import {conversationGuide} from '@/lib/team/conversation-guide';
import {CLIENT_INTERESTS} from '@/lib/team/client-interests';
import {searchCallGuide} from '@/lib/team/call-service-guide';
import {readClientDetails} from '@/lib/client-details';
import styles from './conversation-guide.module.css';
type Props=Parameters<typeof conversationGuide>[0]&{onAddService?:(service:string)=>void};
export function ConversationGuide(props:Props){
 const guide=conversationGuide(props),[service,setService]=useState(props.selectedServices?.[0]||props.customer?.interests?.[0]||'DISTRIBUTION'),[input,setInput]=useState(''),[query,setQuery]=useState('');
 const results=searchCallGuide(service,query),details=readClientDetails(props.customer?.clientDetails),restricted=Boolean(props.customer?.status&&props.customer.status!=='ACTIVE');
 return <section className={styles.guide} aria-label="Call conversation guide"><h3>Your call guide</h3><small>INTRODUCTION / Say it naturally</small><p className={styles.intro}>{guide.intro}</p>
 {!restricted&&<><p>What are you working on, and what would you like help with today?</p>{(details.ageBand==='UNDER_18'||props.customer?.isMinor)&&<p role="note">The client has shared that they are under 18. Start with useful free options and ask who should be involved in any paid decision. Keep the conversation helpful and avoid pressure.</p>}
 <nav className={styles.routes} aria-label="Choose a service route">{Object.entries(CLIENT_INTERESTS).map(([key,label])=><button type="button" key={key} aria-pressed={service===key} onClick={()=>{setService(key);setInput('');setQuery('');}}>{label}</button>)}</nav>
 <form className={styles.search} onSubmit={e=>{e.preventDefault();setQuery(input.trim());}}><label>Search this service<input type="search" value={input} maxLength={160} placeholder="Pricing, rights, files, delivery?" onChange={e=>{setInput(e.target.value);if(!e.target.value.trim())setQuery('');}}/></label><button type="submit">Search</button>{query&&<button type="button" onClick={()=>{setInput('');setQuery('');}}>Clear</button>}</form>
 <CallServicePrices service={service} query={query}/>
 <div className={styles.results} aria-live="polite"><small>{results.length} guide {results.length===1?'result':'results'}</small>{results.map(a=><article key={a.id} className={styles.result}><h4>{a.title}</h4><p>{a.body}</p><a href={a.href} target="_blank" rel="noopener noreferrer">Open current service details</a></article>)}{!results.length&&<p>No matching topic in this service. Try pricing, files or another service route. Confirm unpublished terms with the responsible team.</p>}</div>
 {props.onAddService&&!props.selectedServices?.includes(service)&&<button type="button" onClick={()=>props.onAddService?.(service)}>Add this service to call interests</button>}<small>Browsing a guide does not record client interest. Use the button or activity checkboxes after the client confirms. Prices follow HYMN?s published catalogue; checkout confirms the final amount.</small></>}
 {guide.profile.map(text=><p key={text}>{text}</p>)}{guide.focus.map(topic=><div key={topic.title}><h4>{topic.title}</h4><ul>{topic.questions.map(text=><li key={text}>{text}</li>)}</ul></div>)}<ul>{guide.next.map(text=><li key={text}>{text}</li>)}</ul>
 </section>;
}
