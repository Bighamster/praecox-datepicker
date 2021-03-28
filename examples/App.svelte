<script>
  import Datepicker from "../src/Calendar.svelte";
  import { isPresent } from "./tools.js";

  // let selected = new Date();
  let current_date = "2021-01-30";

  let nowDate = current_date || new Date();
  let selected;

  const handleChangeDate = e => {
    console.log('handleChangeDate', e.detail);
    current_date = new Date(e.detail);
  }

  // $: console.log('selected', selected)
  $: if( isPresent(selected) ) current_date = new Date(selected)
  $: console.log('current_date', current_date, selected)

</script>

<h1>Test 5</h1>

<div class="wrapper">
	<Datepicker
    lang="ru"
    {nowDate}
    on:change={ handleChangeDate }
	/>
</div>

<style>
	.wrapper {
		display: flex;
    justify-content: space-around;
    align-items: center;
	}
</style>
