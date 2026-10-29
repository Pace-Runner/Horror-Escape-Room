# Complete runtime voice inventory

Current local code, including Batches 1 and 2. **123 distinct mapped recordings:** 98 Mark lines + 10 Session 14 lines + 9 reveal recordings + opening report + letter + 2 ending lines + 2 ending reports.

Words below are the current shipped subtitle/script text, not a new transcription. Most incidental thoughts are once per run; repeatable interactions are noted. One voice bus prevents overlap. Higher-priority events, scene changes, an occupied voice bus, or player actions can interrupt or suppress optional lines. Timings relative to scenes depend on decoded audio duration; gameplay triggers are not fixed wall-clock times.

## Opening

**1. opening-news — Newsreader / reporter / spokesperson / radio**

When: After selecting Start Game, difficulty and the headphones prompt; before waking in the bedroom. One continuous recording; subtitle cues span 0.19–72.24s.

Recording: `audio/news_intro.MP3`

> Good evening. We begin tonight with developing news from a privately operated medical research facility on the outskirts of the city. Emergency services sealed the property late last night following reports of a power failure, an explosion and multiple injuries. Our reporter is at the scene. Authorities arrived shortly after 11:00 PM. The facility is believed to have been conducting experimental medical research under a program referred to internally as Project Hollow. Officials have refused to confirm exactly what happened inside, however, one trial subject is still unaccounted for. We asked the facility spokesperson whether that individual may have left the premises. There is no immediate danger to the public. One participant could not be located during the initial evacuation, but there is currently no evidence to suggest they left the facility. We would strongly discourage speculation at this time. Several nearby residents have reported hearing screaming before. The power went out. Are you saying those reports are false? I'm saying I can't comment on unverified witness accounts. Unit 3, hold the perimeter. Nobody goes inside.

## Shared interactions

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 2 | any_wrong_code_1 / Mark | Wrong keypad code; random choice among five responses. | I can't guess randomly. There are too many combinations. | mark/ALL LEVELS/line_wrong_code_1.mp3 |
| 3 | any_wrong_code_2 / Mark | Wrong keypad code; random choice among five responses. | Maybe there is a clue around the room. | mark/ALL LEVELS/line_wrong_code_2.mp3 |
| 4 | any_wrong_code_3 / Mark | Wrong keypad code; random choice among five responses. | This isn't right. | mark/ALL LEVELS/line_wrong_code_3.mp3 |
| 5 | any_wrong_code_4 / Mark | Wrong keypad code; random choice among five responses. | I am missing something. | mark/ALL LEVELS/line_wrong_code_4.mp3 |
| 6 | any_wrong_code_5 / Mark | Wrong keypad code; random choice among five responses. | I need some sort of hint for this puzzle. | mark/ALL LEVELS/line_wrong_code_5.mp3 |
| 7 | any_empty_hand / Mark | Press I to inspect while holding nothing. | I'm not holding anything. | mark/ALL LEVELS/line_inspect_empty_hand.mp3 |

## Level 1 — Bedroom

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 8 | l1_01 / Mark | 5.8s into the wake-up cutscene, as vision focuses. | What… where am I? | mark/LEVEL 1/l1_thought_01_wakeup.mp3 |
| 9 | l1_02 / Mark | 10.45s into the wake-up cutscene, looking at the cuff. | I’m chained to the bed. | mark/LEVEL 1/l1_thought_02_chained.mp3 |
| 10 | l1_03 / Mark | Pick up the paperclip. | That might work. | mark/LEVEL 1/l1_thought_03_paperclip.mp3 |
| 11 | l1_04 / Mark | Unlock the wrist cuff. | Okay… okay. I can move. | mark/LEVEL 1/l1_thought_04_cuff_open.mp3 |
| 12 | l1_05 / Mark | The bedroom bulb blows. | Great. Of course. | mark/LEVEL 1/l1_thought_05_light_blows.mp3 |
| 13 | l1_06 / Mark | Pick up the flashlight. | At least I can see. | mark/LEVEL 1/l1_thought_06_flashlight.mp3 |
| 14 | l1_07 / Mark | First read of the floor message; repeatable by inspecting it again. | Don’t let what out? | mark/LEVEL 1/l1_thought_07_dont_let_it_out.mp3 |
| 15 | l1_08 / Mark | Examine the wall claw marks; repeatable. | Those weren’t made by accident. | mark/LEVEL 1/l1_thought_08_scratch_marks.mp3 |
| 16 | l1_09 / Mark | Collect a family photograph; first accepted occurrence per run. | Why does this place feel familiar? | mark/LEVEL 1/l1_thought_09_familiar_place.mp3 |
| 17 | l1_10 / Mark | The scripted footsteps pass the bedroom door after reading the floor message. | Something’s out there. | mark/LEVEL 1/l1_thought_10_something_outside.mp3 |
| 18 | l1_11 / Mark | Read the PROJECT HOLLOW drawer note; repeatable in the document reader. | The Hollow… is that what’s in this house? | mark/LEVEL 1/l1_thought_11_the_hollow.mp3 |
| 19 | l1_12 / Mark | Observe the flashing lamp; repeatable. | That’s not random. It’s repeating. | mark/LEVEL 1/l1_thought_12_lamp_pattern.mp3 |
| 20 | l1_13 / Mark | Unlock the lamp drawer with 315. | Three-one-five… that was it. | mark/LEVEL 1/l1_thought_13_code_315.mp3 |
| 21 | l1_14 / Mark | Read the PROJECT HOLLOW evidence tag on the lockbox; repeatable. | Project HOLLOW… same name again. | mark/LEVEL 1/l1_thought_14_project_hollow.mp3 |
| 22 | l1_15 / Mark | Solve the photograph board puzzle. | Someone wanted this hidden. | mark/LEVEL 1/l1_thought_15_hidden_cubby.mp3 |
| 23 | l1_16 / Mark | The lockbox lid opens far enough to reveal the crowbar, while the exit remains boarded. | This should get those boards off. | mark/LEVEL 1/l1_thought_16_crowbar.mp3 |
| 24 | l1_17 / Mark | Fold back the rug corner, exposing the loose floorboard. | Wait… that board’s loose. | mark/LEVEL 1/l1_thought_17_loose_floorboard.mp3 |
| 25 | l1_18 / Mark | Find the bedroom key. | A key. Finally. | mark/LEVEL 1/l1_thought_18_found_key.mp3 |
| 26 | l1_19 / Mark | Remove an exit-door plank; first accepted occurrence per run. | Almost out. | mark/LEVEL 1/l1_thought_19_almost_out.mp3 |
| 27 | l1_door_locked_1 / Mark | Repeated unsuccessful exit-door attempts: one possible response with either boards or the key lock still blocking it. | I need to unlock this door so I can find Annabelle. | mark/LEVEL 1/l1_line_door_locked_1.mp3 |
| 28 | l1_door_locked_2 / Mark | Repeated exit-door attempts while boards remain; alternates randomly with the Annabelle/unlock line. | I need to find something to break down these planks of wood. | mark/LEVEL 1/l1_line_door_locked_2.mp3 |
| 29 | l1_door_locked_3 / Mark | Repeated locked-door attempts after removing the boards, without the bedroom key; alternates randomly with the Annabelle/unlock line. | It is still locked. The key might be hidden. | mark/LEVEL 1/l1_line_door_locked_3.mp3 |

## Upstairs hallway

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 30 | hallway_01 / Mark | Start of the hallway blink/creature sequence, after leaving the bedroom. | This isn’t part of the room… | mark/HALLWAY/hallway_thought_01_enter.mp3 |
| 31 | hallway_02 / Mark | Immediately after hallway_01 finishes, in the same authored sequence. | …There. | mark/HALLWAY/hallway_thought_02_creature_seen.mp3 |
| 32 | hallway_03 / Mark | After the blink sequence is visually finished and its first two recordings have finished. | That’s The Hollow. It has to be. | mark/HALLWAY/hallway_thought_03_hollow_assumption.mp3 |
| 33 | hallway_04 / Mark | Reach the stairs and trigger the stairs scare. | No way back. Down it is. | mark/HALLWAY/hallway_thought_04_go_downstairs.mp3 |

## Level 2 — Laboratory

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 34 | l2_01 / Mark | Enter the basement laboratory. | This isn’t just a basement. | mark/LEVEL 2/l2_thought_01_enter_lab.mp3 |
| 35 | l2_20 / Mark | 0.2s after l2_01 finishes, only if laboratory power is still dead. | No power. I need to get this place running. | mark/LEVEL 2/l2_thought_20_initial_power.mp3 |
| 36 | l2_02 / Mark | Examine the restraint/operating table; repeatable. | Someone was held down here. | mark/LEVEL 2/l2_thought_02_restraints.mp3 |
| 37 | l2_13 / Mark | After the operating-table restraint line finishes; once per run. | They did this to a person. | mark/LEVEL 2/l2_thought_13_human_subject.mp3 |
| 38 | l2_03 / Mark | Examine the instrument trolley or its fallen instruments; repeatable. | Whatever happened here… it got violent. | mark/LEVEL 2/l2_thought_03_violent_aftermath.mp3 |
| 39 | l2_04 / Mark | Inspect the torn medical notes; repeatable. | Memory loss. Visual distortion… what were they doing to someone? | mark/LEVEL 2/l2_thought_04_memory_distortion.mp3 |
| 40 | l2_05 / Mark | Use an unpowered monitor, breaker, or main lever; once per run. | No power. Nothing in here’s working like this. | mark/LEVEL 2/l2_thought_05_no_power.mp3 |
| 41 | l2_06 / Mark | Inspect the maintenance log; once per run. | So someone expected this to fail. | mark/LEVEL 2/l2_thought_06_expected_failure.mp3 |
| 42 | l2_07 / Mark | Restore initial laboratory power. | There. Now let’s see what this place was hiding. | mark/LEVEL 2/l2_thought_07_power_restored.mp3 |
| 43 | l2_08 / Mark | Switch on the monitor when real CCTV feeds have power. | Cameras… maybe I can see where that thing went. | mark/LEVEL 2/l2_thought_08_cctv_online.mp3 |
| 44 | l2_09 / Mark | Select CCTV camera five; first recording of the sighting sequence. | There it is. | mark/LEVEL 2/l2_thought_09_creature_on_camera.mp3 |
| 45 | l2_10 / Mark | After l2_09 finishes, still in the camera-five sequence. | …That’s this room. | mark/LEVEL 2/l2_thought_10_this_room.mp3 |
| 46 | l2_25 / Mark | 0.55s after l2_10 finishes, while the creature is still staring in the corner. | It's behind me. | mark/LEVEL 2/l2_thought_25_behind_me.mp3 |
| 47 | l2_11 / Mark | After l2_25 finishes and the turn cue completes, if the creature has not already begun escaping. | No. That can’t be right. | mark/LEVEL 2/l2_thought_11_cant_be_right.mp3 |
| 48 | l2_12 / Mark | After Session 14 finishes and the camera returns from the tape player; first post-tape reaction. | So HOLLOW wasn’t a creature. It was a project. | mark/LEVEL 2/l2_thought_12_hollow_is_project.mp3 |
| 49 | l2_14 / Mark | After l2_12 in the post-tape reaction sequence. | Mark… that must’ve been the subject. | mark/LEVEL 2/l2_thought_14_mark_subject.mp3 |
| 50 | l2_15 / Mark | After l2_14 in the post-tape reaction sequence. | And that girl knew him. | mark/LEVEL 2/l2_thought_15_girl_knew_him.mp3 |
| 51 | l2_16 / Mark | After l2_15; final post-tape reaction. | Whatever happened here started with him. | mark/LEVEL 2/l2_thought_16_started_with_him.mp3 |
| 52 | l2_17 / Mark | 0.6s after the creature finishes running out of the laboratory. | Why isn’t it attacking me? | mark/LEVEL 2/l2_thought_17_not_attacking.mp3 |
| 53 | l2_18 / Mark | Inspect the black pool/blood left by the creature; repeatable. | It’s hurt. | mark/LEVEL 2/l2_thought_18_creature_hurt.mp3 |
| 54 | l2_19 / Mark | Enter the correct security-door code and release its lockout. | That leads further into the house. | mark/LEVEL 2/l2_thought_19_route_forward.mp3 |
| 55 | l2_21 / Mark | Laboratory power fails again after the tape aftermath. | Great. Power's gone again. | mark/LEVEL 2/l2_thought_21_power_failed_again.mp3 |
| 56 | l2_22 / Mark | 0.25s after l2_21 finishes, only while still blacked out and generator progress has not started. | There has to be a generator somewhere. | mark/LEVEL 2/l2_thought_22_find_generator.mp3 |
| 57 | l2_23 / Mark | 10 active gameplay seconds after the generator starts, if the breaker is still unengaged and its cover unopened. | Generator's running… I still need to flip the breaker. | mark/LEVEL 2/l2_thought_23_flip_breaker.mp3 |
| 58 | l2_24 / Mark | Finish routing power at the breaker panel. | That did it. I should check the computer. | mark/LEVEL 2/l2_thought_24_check_computer.mp3 |
| 59 | l2_hint_find_cassette / Mark | At least 15s after initial power restoration, if the cassette has not been collected/played and speech is free; once per run. | I wonder if there's a cassette for the tape player... | mark/LEVEL 2/l2_hint_01_find_cassette.mp3 |
| 60 | l2_hint_play_cassette / Mark | At least 15s after collecting the cassette, if it has not been played and speech is free; once per run. | I should play this cassette... find out what happened here. | mark/LEVEL 2/l2_hint_02_play_cassette.mp3 |

## Level 2 — Session 14 tape

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 61 | session-1 / SCIENTIST | 1.200–7.609s after starting the tape. | Session fourteen. Subject has been sedated for twenty-four hours. Should be coming round any minute. | level2/tape_01_man.m4a |
| 62 | session-2 / SCIENTIST | 7.800–16.833s after starting the tape. | For the record: Project HOLLOW was meant to make the body adapt. Faster healing. Stronger tissue. It did. It hasn't stopped. | level2/tape_02_man.m4a |
| 63 | session-3 / SCIENTIST | 17.000–21.992s after starting the tape. | Visual distortion is increasing. Last week he stopped recognising staff. | level2/tape_03_man.m4a |
| 64 | session-4 / GIRL | 22.100–23.052s after starting the tape. | He'll know me. | level2/tape_04_girl.m4a |
| 65 | session-5 / SCIENTIST | 23.300–25.994s after starting the tape. | He might not. Stay behind the line. | level2/tape_05_man.m4a |
| 66 | session-6 / SCIENTIST | 26.100–27.749s after starting the tape. | He's waking. Note the time. | level2/tape_06_man.m4a |
| 67 | session-7 / GIRL | 29.600–31.806s after starting the tape. | It's okay. You're okay— | level2/tape_07_girl.m4a |
| 68 | session-8 / SCIENTIST | 32.300–33.879s after starting the tape. | Get back. Get back! | level2/tape_08_man.m4a |
| 69 | session-9 / GIRL | 33.900–36.640s after starting the tape. | Mark! It's me, it's me! | level2/tape_09_girl.m4a |
| 70 | session-10 / GIRL | 43.000–43.906s after starting the tape. | Mark… | level2/tape_10_girl.m4a |

## Backrooms

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 71 | backrooms_01 / Mark | Enter the backrooms. | This wasn’t here before. | mark/BACKROOMS/backrooms_thought_01_enter.mp3 |
| 72 | backrooms_02 / Mark | Revisit a mapped corridor after discovering at least three distinct corridor/room legs. | No… I’ve already passed this. | mark/BACKROOMS/backrooms_thought_02_looping.mp3 |
| 73 | backrooms_03 / Mark | Enter another mapped leg after reaching eight distinct legs. | Something’s wrong with this place. | mark/BACKROOMS/backrooms_thought_03_place_wrong.mp3 |
| 74 | backrooms_04 / Mark | After backrooms_03 finishes. | Or with me. | mark/BACKROOMS/backrooms_thought_04_with_me.mp3 |
| 75 | backrooms_05 / Mark | Enter a room after discovering at least eight distinct legs. | I know this. I’ve seen this before. | mark/BACKROOMS/backrooms_thought_05_familiar.mp3 |
| 76 | backrooms_roam / Mark | After accumulating 10s of actual walking in the backrooms. | This room looks familiar. It reminds me of a movie I watched. | mark/BACKROOMS/backrooms_line_roam.mp3 |
| 77 | backrooms_look_1 / Mark | First qualifying sighting of the shadow/hunter: unobstructed, within 16m and 28 degrees of centre, held for 0.35s. | Hello? Who are you? Are you okay? ... Okay. It's a fucking ghost. | mark/BACKROOMS/backrooms_line_look_1.mp3 |
| 78 | backrooms_look_2 / Mark | Second qualifying sighting, after at least 5s out of sight and 20s since the prior sighting response. | I feel like I'm losing my mind. I know it's there, but it just disappears. | mark/BACKROOMS/backrooms_line_look_2.mp3 |
| 79 | backrooms_look_3 / Mark | Third qualifying sighting, under the same separation conditions. | Who the fuck are you? Do you know my sister Annabelle? ... I'm losing it. | mark/BACKROOMS/backrooms_line_look_3.mp3 |
| 80 | backrooms_dead_end_1 / Mark | Reach a blind corridor end within 3.2m, outside a chase; random choice among three responses, at least 20s apart. | A dead end. I'll try another way. | mark/BACKROOMS/backrooms_line_dead_end_1.mp3 |
| 81 | backrooms_dead_end_2 / Mark | Same dead-end trigger; random choice among three responses. | This isn't the way out. | mark/BACKROOMS/backrooms_line_dead_end_2.mp3 |
| 82 | backrooms_dead_end_3 / Mark | Same dead-end trigger; random choice among three responses. | I should go back to another room. | mark/BACKROOMS/backrooms_line_dead_end_3.mp3 |
| 83 | backrooms_08 / Mark | After recovering from the first catch to which sprint noise contributed; requested with a 1s delay. | It hears me when I sprint. | mark/BACKROOMS/backrooms_thought_08_sprinting_alerts_it.mp3 |
| 84 | backrooms_09 / Mark | After a later sprint-related catch; first reminder in the rotating 09 -> 10 -> 11 cycle, with a 45s completed-line cooldown. | I need to stop running. | mark/BACKROOMS/backrooms_thought_09_stop_running.mp3 |
| 85 | backrooms_10 / Mark | After a later sprint-related catch; next reminder in that rotating cycle. | Slow down. Don't let it hear me. | mark/BACKROOMS/backrooms_thought_10_dont_let_it_hear_me.mp3 |
| 86 | backrooms_11 / Mark | After a later sprint-related catch; next reminder in that rotating cycle. | Running gives me away. | mark/BACKROOMS/backrooms_thought_11_running_gives_me_away.mp3 |

## Level 3 — Study

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 87 | backrooms_06 / Mark | First study arrival, after transition/control hand-back and when the voice bus is free. | The study… | mark/BACKROOMS/backrooms_thought_06_the_study.mp3 |
| 88 | backrooms_07 / Mark | Immediately after backrooms_06 finishes on study arrival. | Why do I know that? | mark/BACKROOMS/backrooms_thought_07_why_know_it.mp3 |
| 89 | l3_01 / Mark | First turn of either grandfather-clock hand. | That clock... I've seen it before. | mark/LEVEL 3/l3_thought_01_clock_familiar.mp3 |
| 90 | l3_02 / Mark | Solve the clock at 11:15. | Eleven fifteen... why did I know that? | mark/LEVEL 3/l3_thought_02_clock_solved.mp3 |
| 91 | l3_03 / Mark | Collect the brass sigil exposed by the clock. | This symbol... it belongs somewhere. | mark/LEVEL 3/l3_thought_03_sigil.mp3 |
| 92 | l3_04 / Mark | Pick up the Calibration Visor from the memory archive. | A calibration visor... why does this feel familiar? | mark/LEVEL 3/l3_thought_04_visor_found.mp3 |
| 93 | l3_05 / Mark | Interact with a gallery symbol or truth-record selector while the acquired visor is worn. | It's not hiding things... it's correcting them. | mark/LEVEL 3/l3_thought_05_visor_truth.mp3 |
| 94 | l3_06 / Mark | Examine either visual version of the floor trail after acquiring the visor; repeatable, even with the visor off. | That's not dirt... that's blood. | mark/LEVEL 3/l3_thought_06_blood.mp3 |
| 95 | l3_07 / Mark | Interact with at least three distinct memory-record selectors, memory clues, or truth records. | The same subject keeps appearing in every record. | mark/LEVEL 3/l3_thought_07_records.mp3 |
| 96 | l3_08 / Mark | 0.4s after opening Annabelle’s letter, before its narrated reading. | Annabelle... | mark/LEVEL 3/l3_thought_08_letter.mp3 |
| 97 | l3_hint_clock / Mark | Press H when the selected contextual hint is the clock. | Session fourteen... they noted the time. | mark/LEVEL 3/l3_hint_clock_01_session.mp3 |
| 98 | l3_hint_shadow / Mark | Press H when the selected contextual hint is the Shadow Crest. | The centre stays true... the outer two turn away. | mark/LEVEL 3/l3_hint_shadow_01.mp3 |
| 99 | l3_stealth_01 / Mark | First blackout encounter, triggered by collecting the crest’s archive key. | No... not again. The power's gone. | mark/LEVEL 3/l3_stealth_01_blackout.mp3 |
| 100 | l3_stealth_02 / Mark | First encounter: when the creature enters, nominally 3.2s after the blackout; waits for 01 to finish. | It's here. I need to hide. Now. | mark/LEVEL 3/l3_stealth_02_hide.mp3 |
| 101 | l3_stealth_05 / Mark | First encounter: breaker reminder becomes eligible 4s after creature entry; follows 01 and 02. | There must be a breaker upstairs. I need to get to it. | mark/LEVEL 3/l3_stealth_05_breaker_upstairs.mp3 |
| 102 | l3_stealth_03 / Mark | First encounter: approach a hiding spot or cover after the introduction; once per encounter. | I could hide in there... just stay quiet. | mark/LEVEL 3/l3_stealth_03_hiding_spot.mp3 |
| 103 | l3_stealth_04 / Mark | First encounter: pick up a throwable book or bottle after the introduction; once per encounter. | Maybe if I throw this... it'll follow the noise. | mark/LEVEL 3/l3_stealth_04_distraction.mp3 |
| 104 | l3_stealth_07 / Mark | Restore power during the first encounter; cancels its pending stealth lines. | Power's back. Now to find where this key goes. | mark/LEVEL 3/l3_stealth_07_power_restored.mp3 |
| 105 | l3_come_round / Mark | Recover from the first study catch; after the come-round cutscene. | My neck... something in my neck. Everything's slow. | mark/LEVEL 3/l3_line_come_round.mp3 |
| 106 | l3_books_full / Mark | Attempt to take a fourth study book; repeatable. | Three is all I can carry. | mark/LEVEL 3/l3_line_books_full.mp3 |
| 107 | l3_bottle_carried / Mark | Attempt to take another bottle while already carrying one; repeatable. | I already have a bottle. | mark/LEVEL 3/l3_line_bottle_carried.mp3 |
| 108 | l3_letter_dark / Mark | Attempt to read the final letter during a blackout; repeatable when the reading callback is reached. | I can't read it in this dark. | mark/LEVEL 3/l3_line_letter_dark.mp3 |
| 109 | l3_mirror_dark / Mark | Attempt to start the mirror reveal during a blackout; repeatable. | Not now. Not in the dark. | mark/LEVEL 3/l3_line_mirror_dark.mp3 |

## Level 3 — Letter

**110. letter — Annabelle**

When: While Annabelle’s letter is open: starts automatically after the 0.4s opening beat and Mark’s “Annabelle...” introduction. Closing the document stops it; Space skips narration. The full recording is 156.94s.

Recording: `mark/LEVEL 3/anabelle_reading_letter.mp3`

> Mark,
> 
> I’m writing this tonight because I don’t think I can keep following you much longer.
> 
> You woke up confused and you didn’t recognise me. I tried to stop you from leaving, but every time I came near you, you looked at me like I was something else. You fought me. I’m hurt now, and I’m getting weaker. If you find me again before you understand what’s happening, I’m scared you’ll kill me.
> 
> Project HOLLOW was never a creature. It was the project you helped create, and you were the subject.
> 
> It was meant to make the body adapt — faster healing, stronger tissue, survival after injuries that should have been fatal. You volunteered when no one else would. At first, it worked. Then the changes kept going. Your body changed, your memory began to fail, and eventually your perception changed too. You stopped recognising people. You started seeing things that weren’t really there.
> 
> That’s why you built the Calibration Visor. The visor does not distort what you see. It corrects it.
> 
> The thing you’ve been seeing in this house — the thing following you through the halls — is me. I wasn’t hunting you. I was trying to keep the promise you made me give: if you forgot who you were and tried to leave, I had to stop you.
> 
> The trail you’ve been following is mine too. It isn’t black. It’s blood.
> 
> I don’t know how much longer I have.
> 
> You built one last safeguard into the house. Two controls beside the way out. You told me that if this ever happened, only one of them could be used. One opens the containment. The other seals it again.
> 
> I know what you wanted before your memories started disappearing. You chose containment. You were terrified of what would happen if HOLLOW ever got outside.
> 
> But you didn’t know I would still be trapped here with you.
> 
> I can’t ask you to save me. And I can’t ask you to let HOLLOW outside.
> 
> I know you don’t remember me. I know you probably don’t believe any of this. But before you decide what happens next, there’s something you need to see for yourself.
> 
> Go downstairs.
> 
> Look into the mirror.
> 
> Then look again through the visor.
> 
> After that, the choice is yours.
> 
> — Annabelle

## Level 3 — Final reveal

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 111 | descent / MARK | Approximately 3.50s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | The mirror... I need to see for myself. | mark/LEVEL 3/l3_mark_reveal_01_descent.mp3 |
| 112 | memory / MARK | Approximately 8.50s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | Why can't I remember any of this? | mark/LEVEL 3/l3_mark_reveal_02_memory_panic.mp3 |
| 113 | mirror-no / MARK | Approximately 18.40s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | No... What did I do? | mark/LEVEL 3/l3_mark_reveal_03_mirror_reaction.mp3 |
| 114 | please / ANNABELLE | Approximately 33.93s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | Mark... please. It's me. | mark/LEVEL 3/l3_annabelle_reveal_01_recognition.mp3 |
| 115 | no / MARK | Approximately 38.02s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | No. I saw you. You were following me. | mark/LEVEL 3/l3_mark_reveal_04_accusation.mp3 |
| 116 | tried / ANNABELLE | Approximately 42.58s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | I tried to stop you. You told me to. You made me promise. | mark/LEVEL 3/l3_annabelle_reveal_02_promise.mp3 |
| 117 | remember / MARK | Approximately 48.83s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | I don't remember. | mark/LEVEL 3/l3_mark_reveal_05_dont_remember.mp3 |
| 118 | know / ANNABELLE | Approximately 51.94s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | I know. Your eyes are lying to you. That's why you made the visor. | mark/LEVEL 3/l3_annabelle_reveal_03_truth.mp3 |
| 119 | override / ANNABELLE | Approximately 60.34s into the controlled mirror/reveal cutscene, which begins when the final letter closes. | There's one override left... You decide. | mark/LEVEL 3/l3_annabelle_reveal_04_override.mp3 |

## Ending — release

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 120 | release-dialogue / Annabelle | Choose Emergency Release using the access keycard and handle; dialogue starts about 2.45s into the ending beat. | Mark... no.<br>Please.<br>I can't stop you again. | mark/LEVEL 3/l3_annabelle_ending_release.mp3 |
| 121 | release-news / Newsreader | The same ending, over its title/credits, around 28.05s into the ending beat. | An injured young woman was found alive near a private residence believed to be connected to Project HOLLOW late last night. Police are searching for a second person seen fleeing the property. Witnesses describe the individual as disoriented and dangerously aggressive. Residents are being warned not to approach the figure under any circumstances. | l3_news_release.mp3 |

## Ending — reseal

| # | ID / speaker | When it plays | What it says | Recording |
|---|---|---|---|---|
| 122 | reseal-dialogue / Annabelle | Choose Manual Reseal / containment using the access keycard and handle; dialogue starts about 2.45s into the ending beat. | It's okay, Mark. It's okay. I'm okay. | mark/LEVEL 3/l3_annabelle_ending_reseal.mp3 |
| 123 | reseal-news / Newsreader | The same ending, over its title/credits, around 18.67s into the ending beat. | Authorities remain unable to enter a sealed private residence believed to be connected to Project HOLLOW. A young woman trapped inside is now presumed dead. No one has been seen leaving the property since last night's disturbance. The residence remains sealed under police observation. | l3_news_contained.mp3 |

## Audible vocals outside the scripted dialogue count

- **Annabelle’s singing:** `amb/annabelle_singing.m4a`, a processed Daisy Bell recording. It begins after the upstairs hallway blink sequence and is also positioned at the active backrooms exit. The track repeats after 3–7s gaps. It has no lyric transcript in runtime data; this inventory does not invent its exact sung wording.
- Breathing, gasps, screams, growls and sniffs are vocal sound effects, not additional scripted sentences.

## Text that is not a played voice line

- The nursery inspection is text-only: “Locked. Something about this door makes me glad it won't open.”
- Later study catches: “Again. It put me here again.” is text-only.
- Fifth-catch failure dialogue: “It brought me all the way back. And this time the chain won't give.” is text-only.
- Study creature whispers, including “Sleep, Mark...”, are text-only placeholders.
- The old Level 3 cassette monologues and alternative `l3_mark_reveal_06_someones_there.mp3` do not play.
- The second, harder study blackout exists, but it does not restart the first encounter’s six-line stealth-voice sequence.

## Source of truth

- `src/story/markThoughts.js`, `src/story/studyStealthVoice.js` — Mark’s 98 mapped lines.
- `src/main.js`, level interaction callbacks, `wakeUp.js`, `BackroomsBarks.js`, `StudyArrivalVoice.js`, `StudyStealthVoice.js`, `CassetteReminders.js` — actual triggers and suppression.
- `src/story/sessionTape.js` — ten tape lines and exact cue windows.
- `src/core/OpeningNewsCutscene.js` — opening transcript.
- `src/story/studyReveal.js`, `src/core/LetterNarration.js` — full letter and automatic narration.
- `src/cutscenes/studyReveal.js` — nine grouped reveal recordings.
- `src/cutscenes/studyEndingDialogue.js`, `studyEndingNews.js` — both ending branches.

Validation: every one of the 123 recording keys matches `docs/validation/voice-dialogue-inventory.json`; all 98 Mark keys appear exactly once.
