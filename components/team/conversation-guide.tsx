import {conversationGuide} from '@/lib/team/conversation-guide';
export function ConversationGuide(props:Parameters<typeof conversationGuide>[0]){
 const guide=conversationGuide(props);
 return <section aria-label="Personalised conversation tips"><h3>Conversation tips</h3><p>{guide.intro}</p>{guide.profile.map(text=><p key={text}>{text}</p>)}{guide.focus.map(topic=><div key={topic.title}><h4>{topic.title}</h4><ul>{topic.questions.map(text=><li key={text}>{text}</li>)}</ul></div>)}<ul>{guide.next.map(text=><li key={text}>{text}</li>)}</ul></section>;
}
