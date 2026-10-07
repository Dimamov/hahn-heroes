-- Episode 1 is now entertainment only: eighteen full-screen panels with no checkpoints.
-- Finishing it still pays the coins and the card once. The old quiz keys stay so nothing already earned changes.
update public.story_episodes set checkpoints = 0 where episode = 'ep1';
