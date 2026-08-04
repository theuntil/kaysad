-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V3.3
--
-- ┌─ NE EKLİYOR ──────────────────────────────────────────────────────┐
-- │ 1. TUTARSIZLIK ONARIMI — admin_fix_mismatch()                      │
-- │    Hangi sorunun nasıl düzeltileceğini önce ÖNİZLER, sonra uygular  │
-- │ 2. KİMLİK DÜZENLEME — admin_update_identity()                       │
-- │    auth.users ve profiles'ı TEK İŞLEMDE, doğrulamalı günceller      │
-- │ 3. KİŞİSELLEŞTİRİLMİŞ GÖNDERİM — admin_send_v4()                    │
-- │    {ad} {kullanici_adi} {sehir} gibi değişkenler her alıcı için     │
-- │    ayrı ayrı doldurulur; tek kullanıcıya gönderim de bu fonksiyonla │
-- │ 4. GÖNDERİM DETAY İSTATİSTİĞİ — admin_send_detail()                 │
-- │ 5. HIZLI KULLANICI ARAMA — admin_quick_user_search()                │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v3_2_onay_bildirimleri.sql'den SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) TUTARSIZLIK ONARIMI                                            ║
-- ║                                                                    ║
-- ║  ★ TASARIM: fonksiyon iki modda çalışır.                            ║
-- ║    p_apply = false → SADECE ne yapacağını anlatır (önizleme)        ║
-- ║    p_apply = true  → uygular                                       ║
-- ║  Panel önce önizlemeyi gösterip onay alıyor, sonra uyguluyor.        ║
-- ║  Böylece "neye dokunacağını bilmeden düzelt" durumu oluşmuyor.      ║
-- ║                                                                    ║
-- ║  ★ AUTH ANA KAYNAKTIR. E-posta/telefon çakışmasında auth.users      ║
-- ║    doğru kabul edilip profiles ona eşitlenir — çünkü kullanıcı      ║
-- ║    auth'taki değerle giriş yapıyor. Tersi olsa giriş bozulurdu.     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_fix_mismatch(uuid, text[], boolean);

create or replace function admin_fix_mismatch(
  p_user_id uuid,
  -- null = düzeltilebilir her şey
  p_codes text[] default null,
  p_apply boolean default false
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_auth record;
  v_p profiles;
  v_plan jsonb := '[]'::jsonb;
  v_uygulanan int := 0;
  v_username text;
  v_taban text;
  v_i int;
begin
  select id, email::text as email, phone::text as phone,
         email_confirmed_at, phone_confirmed_at
  into v_auth from auth.users where id = p_user_id;

  select * into v_p from profiles where id = p_user_id;

  if v_auth.id is null and v_p.id is null then
    raise exception 'Kullanici bulunamadi: %', p_user_id;
  end if;

  -- Belirli bir kod istendi mi?
  -- (p_codes null ise hepsi)
  -- Yardımcı: istenmiş mi kontrolü inline yapılıyor.

  /* ── A) PROFİL HİÇ YOK ── */
  if v_p.id is null and v_auth.id is not null
     and (p_codes is null or 'no_profile' = any(p_codes)) then

    v_taban := lower(regexp_replace(coalesce(split_part(v_auth.email, '@', 1), 'kullanici'),
                                    '[^a-z0-9_]', '', 'g'));
    if v_taban = '' then v_taban := 'kullanici'; end if;

    v_username := v_taban;
    v_i := 0;
    while exists (select 1 from profiles where lower(username) = lower(v_username)) loop
      v_i := v_i + 1;
      v_username := v_taban || v_i::text;
    end loop;

    v_plan := v_plan || jsonb_build_object(
      'kod', 'no_profile',
      'islem', 'Profil oluşturulacak',
      'detay', format('profiles satırı yaratılacak · kullanıcı adı: %s · e-posta: %s',
                      v_username, coalesce(v_auth.email, '—'))
    );

    if p_apply then
      insert into profiles (id, username, email, phone, created_at, updated_at)
      values (p_user_id, v_username, v_auth.email, v_auth.phone, now(), now())
      on conflict (id) do nothing;
      v_uygulanan := v_uygulanan + 1;
      select * into v_p from profiles where id = p_user_id;
    end if;
  end if;

  /* ── B) KULLANICI ADI BOŞ ── */
  if v_p.id is not null
     and (v_p.username is null or trim(v_p.username) = '')
     and (p_codes is null or 'username_empty' = any(p_codes)) then

    v_taban := lower(regexp_replace(coalesce(split_part(coalesce(v_auth.email, v_p.email), '@', 1), 'kullanici'),
                                    '[^a-z0-9_]', '', 'g'));
    if v_taban = '' then v_taban := 'kullanici'; end if;

    v_username := v_taban;
    v_i := 0;
    while exists (select 1 from profiles where lower(username) = lower(v_username) and id <> p_user_id) loop
      v_i := v_i + 1;
      v_username := v_taban || v_i::text;
    end loop;

    v_plan := v_plan || jsonb_build_object(
      'kod', 'username_empty',
      'islem', 'Kullanıcı adı atanacak',
      'detay', format('boş → %s', v_username)
    );

    if p_apply then
      update profiles set username = v_username, updated_at = now() where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  /* ── C) E-POSTA UYUŞMUYOR (auth doğru kabul edilir) ── */
  if v_p.id is not null and v_auth.email is not null and v_p.email is not null
     and lower(v_auth.email) <> lower(v_p.email)
     and (p_codes is null or 'email_mismatch' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'email_mismatch',
      'islem', 'Profil e-postası auth ile eşitlenecek',
      'detay', format('profiles.email: %s → %s  (auth ana kaynak)', v_p.email, v_auth.email)
    );

    if p_apply then
      update profiles set email = v_auth.email, updated_at = now() where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  /* ── D) PROFİLDE E-POSTA YOK ── */
  if v_p.id is not null and v_auth.email is not null and v_p.email is null
     and (p_codes is null or 'email_missing_profile' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'email_missing_profile',
      'islem', 'Profil e-postası doldurulacak',
      'detay', format('boş → %s', v_auth.email)
    );

    if p_apply then
      update profiles set email = v_auth.email, updated_at = now() where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  /* ── E) TELEFON UYUŞMUYOR ── */
  if v_p.id is not null and v_auth.phone is not null and v_p.phone is not null
     and v_auth.phone <> v_p.phone
     and (p_codes is null or 'phone_mismatch' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'phone_mismatch',
      'islem', 'Profil telefonu auth ile eşitlenecek',
      'detay', format('profiles.phone: %s → %s', v_p.phone, v_auth.phone)
    );

    if p_apply then
      update profiles set phone = v_auth.phone, updated_at = now() where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  /* ── F) E-POSTA DOĞRULAMA BAYRAĞI ── */
  if v_p.id is not null
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='profiles' and column_name='email_verified')
     and (v_auth.email_confirmed_at is not null) <> coalesce(v_p.email_verified, false)
     and (p_codes is null or 'email_verify_mismatch' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'email_verify_mismatch',
      'islem', 'E-posta doğrulama bayrağı düzeltilecek',
      'detay', format('profiles.email_verified: %s → %s',
                      coalesce(v_p.email_verified,false), (v_auth.email_confirmed_at is not null))
    );

    if p_apply then
      update profiles set email_verified = (v_auth.email_confirmed_at is not null), updated_at = now()
      where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  /* ── G) TELEFON DOĞRULAMA BAYRAĞI ── */
  if v_p.id is not null
     and exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='profiles' and column_name='phone_verify')
     and (v_auth.phone_confirmed_at is not null) <> coalesce(v_p.phone_verify, false)
     and (p_codes is null or 'phone_verify_mismatch' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'phone_verify_mismatch',
      'islem', 'Telefon doğrulama bayrağı düzeltilecek',
      'detay', format('profiles.phone_verify: %s → %s',
                      coalesce(v_p.phone_verify,false), (v_auth.phone_confirmed_at is not null))
    );

    if p_apply then
      update profiles set phone_verify = (v_auth.phone_confirmed_at is not null), updated_at = now()
      where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  /* ── H) BANLI İŞARETLİ AMA BAN KAYDI YOK → bayrağı kaldır ── */
  if v_p.id is not null and coalesce(v_p.is_banned, false) = true
     and not exists (select 1 from bans b where b.user_id = p_user_id and coalesce(b.is_active, true))
     and (p_codes is null or 'ban_flag_no_record' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'ban_flag_no_record',
      'islem', 'Ban bayrağı kaldırılacak',
      'detay', 'Aktif ban kaydı yok. profiles.is_banned: true → false (kullanıcı yeniden girebilir)'
    );

    if p_apply then
      update profiles set is_banned = false, updated_at = now() where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  /* ── I) AKTİF BAN VAR AMA BAYRAK YOK → bayrağı koy ── */
  if v_p.id is not null and coalesce(v_p.is_banned, false) = false
     and exists (select 1 from bans b where b.user_id = p_user_id and coalesce(b.is_active, true))
     and (p_codes is null or 'ban_record_no_flag' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'ban_record_no_flag',
      'islem', 'Ban bayrağı işaretlenecek',
      'detay', 'Aktif ban kaydı var. profiles.is_banned: false → true (kullanıcı girişi kapanır)'
    );

    if p_apply then
      update profiles set is_banned = true, updated_at = now() where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  /* ── J) ROL / ÖĞRENCİ BAYRAK TUTARSIZLIĞI ── */
  if v_p.id is not null and v_p.business_durum = 'approved' and coalesce(v_p.role,'user') <> 'business'
     and (p_codes is null or 'business_role_mismatch' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'business_role_mismatch',
      'islem', 'Rol business yapılacak',
      'detay', format('business_durum onaylı ama role = %s → business', coalesce(v_p.role,'user'))
    );

    if p_apply then
      update profiles set role = 'business', updated_at = now() where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  if v_p.id is not null and v_p.ogrenci_durum = 'approved' and coalesce(v_p.ogrenci,false) = false
     and (p_codes is null or 'student_flag_mismatch' = any(p_codes)) then

    v_plan := v_plan || jsonb_build_object(
      'kod', 'student_flag_mismatch',
      'islem', 'Öğrenci bayrağı işaretlenecek',
      'detay', 'ogrenci_durum onaylı ama ogrenci = false → true'
    );

    if p_apply then
      update profiles set ogrenci = true, updated_at = now() where id = p_user_id;
      v_uygulanan := v_uygulanan + 1;
    end if;
  end if;

  return json_build_object(
    'uygulandi', p_apply,
    'plan', v_plan,
    'adet', jsonb_array_length(v_plan),
    'degisen', v_uygulanan,
    -- Düzeltilemeyenler: mükerrer kayıt ve auth'u olmayan profil.
    -- Bunlar veri silmeyi gerektiriyor; otomatik yapılmıyor.
    'elle_gereken', (
      select coalesce(json_agg(x), '[]'::json) from (
        select 'duplicate_username' as kod,
               'Aynı kullanıcı adına sahip başka kayıt var — hangisinin kalacağına insan karar vermeli' as sebep
        where v_p.username is not null
          and (select count(*) from profiles p2 where lower(p2.username) = lower(v_p.username)) > 1
        union all
        select 'no_auth',
               'Auth kaydı yok; profil sahipsiz. Silmek ya da yeni auth açmak gerekir'
        where v_auth.id is null
      ) x
    )
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) KİMLİK DÜZENLEME (auth + profiles birlikte)                    ║
-- ║                                                                    ║
-- ║  ★ E-posta ve telefon HEM auth.users HEM profiles'ta güncellenir.   ║
-- ║    Sadece birini güncellemek tutarsızlık üretir (panelin yakaladığı ║
-- ║    hataların çoğu bundan doğuyordu).                                ║
-- ║  ★ Doğrulama SQL'de de yapılıyor: panel atlatılsa bile geçersiz     ║
-- ║    e-posta/telefon yazılamaz.                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_update_identity(uuid, jsonb);

create or replace function admin_update_identity(
  p_user_id uuid,
  -- {email, phone, username, name, sehir, bio, website, business_name, gizli}
  p_patch jsonb
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_phone text;
  v_username text;
  v_degisen text[] := '{}';
  v_p profiles;
begin
  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'Degisiklik yok';
  end if;

  select * into v_p from profiles where id = p_user_id;

  /* ── E-POSTA ── */
  if p_patch ? 'email' then
    v_email := nullif(trim(p_patch->>'email'), '');

    if v_email is not null then
      -- Basit ama işe yarar doğrulama: tek @, noktalı alan adı, boşluk yok
      if v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
        raise exception 'Gecersiz e-posta adresi: %', v_email;
      end if;

      if exists (select 1 from auth.users where lower(email) = lower(v_email) and id <> p_user_id) then
        raise exception 'Bu e-posta baska bir hesapta kullaniliyor: %', v_email;
      end if;
    end if;

    update auth.users
    set email = v_email,
        -- ★ E-posta değişti: doğrulama sıfırlanır. Aksi halde
        --   doğrulanmamış bir adres "doğrulanmış" görünür.
        email_confirmed_at = case
          when lower(coalesce(v_email,'')) = lower(coalesce(email,'')) then email_confirmed_at
          else null end,
        updated_at = now()
    where id = p_user_id;

    update profiles set email = v_email,
                        email_verified = case when v_email is null then false else false end,
                        updated_at = now()
    where id = p_user_id;

    v_degisen := v_degisen || 'email';
  end if;

  /* ── TELEFON ── */
  if p_patch ? 'phone' then
    v_phone := nullif(regexp_replace(coalesce(p_patch->>'phone',''), '[^0-9+]', '', 'g'), '');

    if v_phone is not null then
      -- Panel +90'ı sabit gönderiyor; burada da zorunlu tutuyoruz
      if v_phone !~ '^\+90[0-9]{10}$' then
        raise exception 'Telefon +90 ve 10 hane olmali (ornek: +905551234567). Gelen: %', v_phone;
      end if;

      if exists (select 1 from auth.users where phone = v_phone and id <> p_user_id) then
        raise exception 'Bu telefon baska bir hesapta kullaniliyor: %', v_phone;
      end if;
    end if;

    update auth.users
    set phone = v_phone,
        phone_confirmed_at = case
          when coalesce(v_phone,'') = coalesce(phone,'') then phone_confirmed_at
          else null end,
        updated_at = now()
    where id = p_user_id;

    update profiles set phone = v_phone, updated_at = now() where id = p_user_id;

    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name='phone_verify') then
      update profiles set phone_verify = false where id = p_user_id;
    end if;

    v_degisen := v_degisen || 'phone';
  end if;

  /* ── KULLANICI ADI ── */
  if p_patch ? 'username' then
    v_username := nullif(trim(p_patch->>'username'), '');

    if v_username is null then
      raise exception 'Kullanici adi bos olamaz';
    end if;
    if v_username !~ '^[A-Za-z0-9._]{3,30}$' then
      raise exception 'Kullanici adi 3-30 karakter olmali; harf, rakam, nokta ve alt cizgi kullanilabilir';
    end if;
    if exists (select 1 from profiles where lower(username) = lower(v_username) and id <> p_user_id) then
      raise exception 'Bu kullanici adi alinmis: %', v_username;
    end if;

    update profiles set username = v_username, updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'username';
  end if;

  /* ── DİĞER SERBEST ALANLAR ── */
  if p_patch ? 'name' then
    update profiles set name = nullif(trim(p_patch->>'name'), ''), updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'name';
  end if;

  if p_patch ? 'sehir' then
    update profiles set sehir = nullif(trim(p_patch->>'sehir'), ''), updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'sehir';
  end if;

  if p_patch ? 'bio' and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='bio') then
    update profiles set bio = nullif(trim(p_patch->>'bio'), ''), updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'bio';
  end if;

  if p_patch ? 'website' and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='website') then
    update profiles set website = nullif(trim(p_patch->>'website'), ''), updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'website';
  end if;

  if p_patch ? 'business_name' and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='business_name') then
    update profiles set business_name = nullif(trim(p_patch->>'business_name'), ''), updated_at = now()
    where id = p_user_id;
    v_degisen := v_degisen || 'business_name';
  end if;

  if p_patch ? 'gizli' then
    update profiles set gizli = (p_patch->>'gizli')::boolean, updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'gizli';
  end if;

  return json_build_object('degisen', v_degisen, 'adet', array_length(v_degisen, 1));
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) KİŞİSELLEŞTİRİLMİŞ GÖNDERİM — admin_send_v4                    ║
-- ║                                                                    ║
-- ║  Mesajda şu değişkenler kullanılabilir:                             ║
-- ║    {ad}            → profiles.name (yoksa kullanıcı adı)           ║
-- ║    {kullanici_adi} → profiles.username                              ║
-- ║    {sehir}         → profiles.sehir (yoksa "şehrinizde")           ║
-- ║    {eposta}        → profiles.email                                 ║
-- ║                                                                    ║
-- ║  ★ Değişken değiştirme SQL tarafında, ALICI BAŞINA yapılıyor.        ║
-- ║    Panelde tek tek döngü kursak 20.000 kullanıcıda 20.000 istek     ║
-- ║    atardık; burada tek INSERT ... SELECT ile hallediliyor.           ║
-- ║                                                                    ║
-- ║  p_user_ids verilirse hedefleme filtreleri YOK SAYILIR — sadece o   ║
-- ║  kullanıcılara gider (tek kişiye bildirim için).                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_send_v4(text, text, text, uuid, text[], boolean, boolean, boolean, uuid[]);

create or replace function admin_send_v4(
  p_type text,
  p_message text,
  p_channel text default 'both',
  p_popup_id uuid default null,
  p_cities text[] default null,
  p_students_only boolean default false,
  p_business_only boolean default false,
  p_only_active boolean default true,
  p_user_ids uuid[] default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_message text;
  v_count integer := 0;
  v_push_status text;
begin
  if p_type not in ('promo', 'earthquake', 'popup') then
    raise exception 'Gecersiz gonderim tipi: %', p_type;
  end if;
  if coalesce(p_channel,'both') not in ('both','inapp','push') then
    raise exception 'Gecersiz kanal: %', p_channel;
  end if;

  if p_type = 'popup' then
    if p_popup_id is null then raise exception 'popup tipinde p_popup_id zorunludur.'; end if;
    if not exists (select 1 from popups where id = p_popup_id) then
      raise exception 'Popup bulunamadi: %', p_popup_id;
    end if;
    v_entity_type := 'popup';
    v_entity_id := p_popup_id;
    select coalesce(nullif(trim(coalesce(p_message,'')), ''), title) into v_message
    from popups where id = p_popup_id;
  else
    v_entity_type := case when p_type = 'promo' then 'promotion' else 'system' end;
    v_entity_id := null;
    v_message := nullif(trim(coalesce(p_message,'')), '');
    if v_message is null then raise exception 'Mesaj bos olamaz.'; end if;
  end if;

  if p_channel = 'push' then
    return json_build_object('kanal','push','gonderilen',0,'tip',p_type,
      'mesaj',v_message,'popup_id',v_entity_id,
      'not','Uygulama ici bildirim olusturulmadi; push panel tarafindan gonderilir.');
  end if;

  v_push_status := case when p_channel = 'inapp' then 'skipped' else 'pending' end;

  insert into notifications (
    recipient_id, actor_id, type, entity_type, entity_id, message, is_read,
    push_status, push_error
  )
  select
    p.id, null, p_type, v_entity_type, v_entity_id,
    -- ★ Değişken doldurma — alıcı başına
    replace(
      replace(
        replace(
          replace(v_message, '{ad}',
            coalesce(nullif(trim(p.name), ''), nullif(trim(p.username), ''), 'değerli kullanıcı')),
          '{kullanici_adi}', coalesce(nullif(trim(p.username), ''), 'kullanici')),
        '{sehir}', coalesce(nullif(trim(p.sehir), ''), 'şehrinizde')),
      '{eposta}', coalesce(p.email, '')),
    false, v_push_status,
    case when p_channel = 'inapp' then 'panel: sadece uygulama ici' else null end
  from profiles p
  where
    case
      -- ★ Belirli kullanıcılar seçildiyse filtreler devre dışı
      when p_user_ids is not null and array_length(p_user_ids, 1) > 0
        then p.id = any(p_user_ids)
      else
        (p_only_active = false or (
          coalesce(p.is_banned, false) = false))
        and (p_cities is null or p.sehir = any(p_cities))
        and (p_students_only = false or coalesce(p.ogrenci, false) = true)
        and (p_business_only = false or p.role = 'business')
    end;

  get diagnostics v_count = row_count;

  return json_build_object(
    'kanal', p_channel,
    'gonderilen', v_count,
    'tip', p_type,
    'mesaj', v_message,
    'popup_id', v_entity_id,
    'kisisel', (v_message like '%{%}%'),
    'secili_kullanici', coalesce(array_length(p_user_ids, 1), 0)
  );
end;
$$;


-- ── Değişkenli mesajın belirli bir kullanıcı için nasıl görüneceği ──
drop function if exists admin_render_message(text, uuid);

create or replace function admin_render_message(p_message text, p_user_id uuid default null)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_user_id is null then
      replace(replace(replace(replace(p_message,
        '{ad}', 'Ahmet Yılmaz'), '{kullanici_adi}', 'ahmety'),
        '{sehir}', 'Ankara'), '{eposta}', 'ahmet@ornek.com')
    else (
      select replace(replace(replace(replace(p_message,
        '{ad}', coalesce(nullif(trim(p.name),''), nullif(trim(p.username),''), 'değerli kullanıcı')),
        '{kullanici_adi}', coalesce(nullif(trim(p.username),''), 'kullanici')),
        '{sehir}', coalesce(nullif(trim(p.sehir),''), 'şehrinizde')),
        '{eposta}', coalesce(p.email,''))
      from profiles p where p.id = p_user_id
    )
  end;
$$;


-- ── Kişiselleştirilmiş PUSH hedefleri: token + doldurulmuş metin ──
drop function if exists admin_push_targets_personal(text, text[], boolean, boolean, text[], integer, uuid[], integer);

create or replace function admin_push_targets_personal(
  p_message text,
  p_cities text[] default null,
  p_students_only boolean default false,
  p_business_only boolean default false,
  p_platforms text[] default null,
  p_active_days integer default null,
  p_user_ids uuid[] default null,
  p_limit integer default 5000
) returns table (
  user_id uuid, device_id text, push_token text, platform text, message text
)
language sql security definer set search_path = public as $$
  select d.user_id, d.device_id, d.push_token, d.platform,
         replace(replace(replace(replace(p_message,
           '{ad}', coalesce(nullif(trim(p.name),''), nullif(trim(p.username),''), 'değerli kullanıcı')),
           '{kullanici_adi}', coalesce(nullif(trim(p.username),''), 'kullanici')),
           '{sehir}', coalesce(nullif(trim(p.sehir),''), 'şehrinizde')),
           '{eposta}', coalesce(p.email,'')) as message
  from devices d
  join profiles p on p.id = d.user_id
  where d.push_token is not null and d.push_token <> ''
    and coalesce(d.push_enabled, true) = true
    and coalesce(p.is_banned, false) = false
    and (p_platforms is null or d.platform = any(p_platforms))
    and (p_active_days is null or d.last_login_at > now() - make_interval(days => p_active_days))
    and case
      when p_user_ids is not null and array_length(p_user_ids,1) > 0 then p.id = any(p_user_ids)
      else (p_cities is null or p.sehir = any(p_cities))
        and (p_students_only = false or coalesce(p.ogrenci,false) = true)
        and (p_business_only = false or p.role = 'business')
    end
  limit greatest(1, least(50000, coalesce(p_limit, 5000)));
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) GÖNDERİM DETAY İSTATİSTİĞİ                                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_send_detail(text, text);

create or replace function admin_send_detail(p_type text, p_message text)
returns json language sql security definer set search_path = public as $$
  with n as (
    select * from notifications
    where type = p_type and message = p_message
  )
  select json_build_object(
    'tip', p_type,
    'mesaj', p_message,
    'toplam',        (select count(*) from n),
    'okundu',        (select count(*) from n where is_read),
    'okunmadi',      (select count(*) from n where not is_read),
    'push_sent',     (select count(*) from n where push_status = 'sent'),
    'push_failed',   (select count(*) from n where push_status = 'failed'),
    'push_pending',  (select count(*) from n where push_status = 'pending'),
    'push_skipped',  (select count(*) from n where push_status = 'skipped'),
    'ilk',           (select min(created_at) from n),
    'son',           (select max(created_at) from n),
    'ilk_push',      (select min(pushed_at) from n where pushed_at is not null),
    'son_push',      (select max(pushed_at) from n where pushed_at is not null),
    -- Şehir kırılımı
    'sehirler', (
      select coalesce(json_agg(x order by x.adet desc), '[]'::json) from (
        select coalesce(p.sehir, 'bilinmiyor') as sehir,
               count(*) as adet,
               count(*) filter (where nn.is_read) as okundu
        from n nn join profiles p on p.id = nn.recipient_id
        group by coalesce(p.sehir, 'bilinmiyor')
        limit 20
      ) x
    ),
    -- Hata kırılımı
    'hatalar', (
      select coalesce(json_agg(x order by x.adet desc), '[]'::json) from (
        select coalesce(nn.push_error, 'bilinmiyor') as hata, count(*) as adet
        from n nn where nn.push_status = 'failed'
        group by coalesce(nn.push_error, 'bilinmiyor')
        limit 10
      ) x
    ),
    -- push_log üzerinden cihaz/platform kırılımı
    'platformlar', (
      select coalesce(json_agg(x order by x.adet desc), '[]'::json) from (
        select coalesce(d.platform, 'bilinmiyor') as platform, count(*) as adet
        from push_log l
        join n nn on nn.id = l.notification_id
        left join devices d on d.device_id = l.device_id
        group by coalesce(d.platform, 'bilinmiyor')
      ) x
    ),
    'log_ok',    (select count(*) from push_log l join n nn on nn.id = l.notification_id where l.result = 'ok'),
    'log_hata',  (select count(*) from push_log l join n nn on nn.id = l.notification_id where l.result <> 'ok'),
    -- Saatlik dağılım (ilk 24 saat)
    'zaman_cizgisi', (
      select coalesce(json_agg(x order by x.saat), '[]'::json) from (
        select date_trunc('hour', nn.created_at) as saat, count(*) as adet
        from n nn group by date_trunc('hour', nn.created_at)
        order by 1 limit 48
      ) x
    )
  );
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) HIZLI KULLANICI ARAMA (bildirim ve ban ekranları için)          ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_quick_user_search(text, integer);

create or replace function admin_quick_user_search(
  p_query text,
  p_limit integer default 12
) returns table (
  user_id uuid, username text, name text, avatar_url text,
  email text, phone text, sehir text, role text,
  is_banned boolean, device_count bigint, push_device_count bigint,
  has_profile boolean
)
language sql security definer set search_path = public as $$
  select
    u.id, p.username::text, p.name::text, p.avatar_url,
    coalesce(u.email::text, p.email) as email,
    coalesce(u.phone::text, p.phone::text) as phone,
    p.sehir, p.role::text,
    coalesce(p.is_banned, false)
      or exists (select 1 from bans b where b.user_id = u.id and coalesce(b.is_active,true)) as is_banned,
    (select count(*) from devices d where d.user_id = u.id) as device_count,
    (select count(*) from devices d where d.user_id = u.id
       and d.push_token is not null and d.push_token <> '') as push_device_count,
    (p.id is not null) as has_profile
  from auth.users u
  left join profiles p on p.id = u.id
  where nullif(trim(coalesce(p_query,'')), '') is not null
    and (
      p.username ilike '%' || p_query || '%'
      or p.name ilike '%' || p_query || '%'
      or u.email::text ilike '%' || p_query || '%'
      or p.email ilike '%' || p_query || '%'
      or u.phone::text ilike '%' || regexp_replace(p_query, '[^0-9]', '', 'g') || '%'
      or u.id::text = p_query
    )
  order by (p.username is null), p.username
  limit greatest(1, least(50, coalesce(p_limit, 12)));
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) ELLE BAN — kullanıcı, cihaz veya IP (tek kapı)                  ║
-- ║                                                                    ║
-- ║  Panelin "+ Ban ekle" ekranı bunu çağırıyor. Üç hedefin hiçbiri     ║
-- ║  verilmezse hata; en az biri gerekli. Aynı anda birden fazlası da   ║
-- ║  verilebilir (kullanıcı + cihaz + IP tek seferde).                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_create_ban(uuid, text, text, text, text, timestamptz, text);

create or replace function admin_create_ban(
  p_user_id uuid default null,
  p_device_id text default null,
  p_ip text default null,
  p_reason text default null,
  p_notes text default null,
  p_until timestamptz default null,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := '{}';
  v_id uuid;
  v_dev text := nullif(trim(coalesce(p_device_id, '')), '');
  v_ip  text := nullif(trim(coalesce(p_ip, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_etkilenen_kullanici bigint := 0;
begin
  if v_reason is null then
    raise exception 'Ban sebebi zorunlu';
  end if;
  if p_user_id is null and v_dev is null and v_ip is null then
    raise exception 'En az bir hedef gerekli: kullanici, cihaz ya da IP';
  end if;

  -- ── Kullanıcı banı ──
  if p_user_id is not null then
    if not exists (select 1 from auth.users where id = p_user_id)
       and not exists (select 1 from profiles where id = p_user_id) then
      raise exception 'Kullanici bulunamadi: %', p_user_id;
    end if;

    insert into bans (user_id, reason, type, notes, until_at, is_active, banned_by)
    values (p_user_id, v_reason, 'manual', p_notes, p_until, true, p_banned_by)
    returning id into v_id;
    v_ids := v_ids || v_id;

    update profiles set is_banned = true, updated_at = now() where id = p_user_id;
  end if;

  -- ── Cihaz banı ──
  if v_dev is not null then
    if exists (select 1 from bans where device_id = v_dev and coalesce(is_active, true)) then
      update bans set reason = v_reason, notes = p_notes, until_at = p_until,
                      banned_by = p_banned_by, created_at = now()
      where device_id = v_dev and coalesce(is_active, true)
      returning id into v_id;
    else
      insert into bans (user_id, device_id, platform, reason, type, notes, until_at, is_active, banned_by)
      values (
        p_user_id, v_dev,
        (select platform from devices where device_id = v_dev order by last_login_at desc nulls last limit 1),
        v_reason, 'device', p_notes, p_until, true, p_banned_by
      )
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;

    select count(distinct user_id) into v_etkilenen_kullanici
    from devices where device_id = v_dev and user_id is not null;
  end if;

  -- ── IP banı ──
  if v_ip is not null then
    if exists (select 1 from bans where ip = v_ip and coalesce(is_active, true)) then
      update bans set reason = v_reason, notes = p_notes, until_at = p_until,
                      banned_by = p_banned_by, created_at = now()
      where ip = v_ip and coalesce(is_active, true)
      returning id into v_id;
    else
      insert into bans (ip, reason, type, notes, until_at, is_active, banned_by)
      values (v_ip, v_reason, 'ip', p_notes, p_until, true, p_banned_by)
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end if;

  return json_build_object(
    'ban_ids', v_ids,
    'adet', coalesce(array_length(v_ids, 1), 0),
    'kullanici', p_user_id,
    'cihaz', v_dev,
    'ip', v_ip,
    'cihazi_kullanan_hesap', v_etkilenen_kullanici,
    'ipyi_kullanan_hesap', (
      select count(distinct user_id) from devices where v_ip is not null and ip = v_ip and user_id is not null
    )
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) ŞEHİR İSTATİSTİĞİ — genişletilmiş (tüm şehirler sayfası için)   ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_city_stats_full();

create or replace function admin_city_stats_full()
returns table (
  sehir text,
  kullanici bigint,
  push_cihaz bigint,
  ogrenci bigint,
  isletme bigint,
  banli bigint,
  yeni_7g bigint,
  son_kayit timestamptz
)
language sql security definer set search_path = public as $$
  with iller(sehir) as (
    values ('Adana'),('Adıyaman'),('Afyonkarahisar'),('Ağrı'),('Aksaray'),('Amasya'),
    ('Ankara'),('Antalya'),('Ardahan'),('Artvin'),('Aydın'),('Balıkesir'),('Bartın'),
    ('Batman'),('Bayburt'),('Bilecik'),('Bingöl'),('Bitlis'),('Bolu'),('Burdur'),
    ('Bursa'),('Çanakkale'),('Çankırı'),('Çorum'),('Denizli'),('Diyarbakır'),('Düzce'),
    ('Edirne'),('Elazığ'),('Erzincan'),('Erzurum'),('Eskişehir'),('Gaziantep'),
    ('Giresun'),('Gümüşhane'),('Hakkâri'),('Hatay'),('Iğdır'),('Isparta'),('İstanbul'),
    ('İzmir'),('Kahramanmaraş'),('Karabük'),('Karaman'),('Kars'),('Kastamonu'),
    ('Kayseri'),('Kilis'),('Kırıkkale'),('Kırklareli'),('Kırşehir'),('Kocaeli'),
    ('Konya'),('Kütahya'),('Malatya'),('Manisa'),('Mardin'),('Mersin'),('Muğla'),
    ('Muş'),('Nevşehir'),('Niğde'),('Ordu'),('Osmaniye'),('Rize'),('Sakarya'),
    ('Samsun'),('Siirt'),('Sinop'),('Sivas'),('Şanlıurfa'),('Şırnak'),('Tekirdağ'),
    ('Tokat'),('Trabzon'),('Tunceli'),('Uşak'),('Van'),('Yalova'),('Yozgat'),('Zonguldak')
  ),
  agg as (
    select
      p.sehir,
      count(*) as kullanici,
      count(*) filter (where coalesce(p.ogrenci,false)) as ogrenci,
      count(*) filter (where p.role = 'business') as isletme,
      count(*) filter (where coalesce(p.is_banned,false)) as banli,
      count(*) filter (where p.created_at > now() - interval '7 days') as yeni_7g,
      max(p.created_at) as son_kayit,
      (select count(*) from devices d
        where d.user_id in (select p2.id from profiles p2 where p2.sehir = p.sehir)
          and d.push_token is not null and d.push_token <> '') as push_cihaz
    from profiles p
    group by p.sehir
  )
  select
    i.sehir,
    coalesce(a.kullanici, 0), coalesce(a.push_cihaz, 0),
    coalesce(a.ogrenci, 0), coalesce(a.isletme, 0), coalesce(a.banli, 0),
    coalesce(a.yeni_7g, 0), a.son_kayit
  from iller i
  left join agg a on a.sehir = i.sehir
  order by coalesce(a.kullanici, 0) desc, i.sehir asc;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  8) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_fix_mismatch','admin_update_identity','admin_send_v4',
                        'admin_render_message','admin_push_targets_personal',
                        'admin_send_detail','admin_quick_user_search','admin_create_ban',
                        'admin_city_stats_full')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select p.proname, has_function_privilege('service_role', p.oid, 'execute') as yetki
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in
  ('admin_fix_mismatch','admin_update_identity','admin_send_v4','admin_render_message',
   'admin_push_targets_personal','admin_send_detail','admin_quick_user_search',
   'admin_create_ban','admin_city_stats_full')
order by 1;

-- Değişken doldurma testi (örnek değerlerle)
select admin_render_message('Sayın {ad}, {sehir} şehrinde 10 etkinlik var.') as ornek;
