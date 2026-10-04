INSERT INTO "newsletter_subscribers" ("email", "status", "source", "consent_at", "unsubscribe_token", "created_at", "updated_at")
SELECT email, 'subscribed', 'instagram', CURRENT_TIMESTAMP, md5(random()::text || clock_timestamp()::text || email), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('dakshmusic2781@gmail.com'), ('aadityaverma9612@gmail.com'), ('huumraazz1@gmail.com'), ('tripathisarvesh098@gmail.com'),
  ('tagmusicrecords@gmail.com'), ('shashankaggarwal4518@gmail.com'), ('karneast@gmail.com'), ('vampreign888@gmail.com'),
  ('kevilprajapati28@gmail.com'), ('vidhatesid5589@gmail.com'), ('krish333107@gmail.com'), ('jeetkhurana225@gmail.com'),
  ('vikkalpmusic@gmail.com'), ('priyanshudey74@gmail.com'), ('shards2nov2021@gmail.com'), ('bosshiphop0@gmail.com'),
  ('abhavmishra0@gmail.com'), ('rudrxplug@gmail.com'), ('garamkhoon79@gmail.com'), ('ssumayukh@gmail.com'),
  ('lveharman@gmail.com'), ('hellplxyz@gmail.com'), ('aritrarumki64@gmail.com'), ('deepraj2verma@gmail.com'),
  ('sanketdansana45@gmail.com'), ('rtizvibez@gmail.com'), ('daretobewrath@gmail.com'), ('ninjalazy6@gmail.com'),
  ('housnur16@gmail.com'), ('bellicoseofficial84@gmail.com'), ('zecterop@gmail.com'), ('gurjjar2002@gmail.com'),
  ('dhyanipratham12@gmail.com'), ('rohitk042001@gmail.com'), ('groovy.bars333@gmail.com'), ('madhvplug@gmail.com'),
  ('meet4muzic@gmail.com'), ('hxrshdkapoor@gmail.com'), ('dealwithmudpel@gmail.com'), ('chrisparmar14@gmail.com'),
  ('nirbhaynathani0@gmail.com'), ('vaibhavrawatartist@gmail.com'), ('rajmusic1712@gmail.com'), ('dipendras135@gmail.com'),
  ('bairagihu@gmail.com'), ('work.ayusht@gmail.com'), ('manavkapoor2005@gmail.com'), ('workwithknock@gmail.com'),
  ('mckranti022@gmail.com'), ('rehank1234567891011@gmail.com'), ('chandratanuj27@gmail.com')
) AS imported(email)
ON CONFLICT ("email") DO NOTHING;
