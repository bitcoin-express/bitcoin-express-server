const COIN_SELECTION = "coinsSelection";
const COIN_SELECTION_FN = "coinSelectionFn";
const DEFAULT_ISSUER = "defaultIssuer";
const COMBINATION_SEARCH = 10;
const DEFAULT_EXPIRY_PERIOD = (1000 * 60 * 60) * ((24 * 3) - 1);

let ISSUERS = new Object();
let WHOLE_COIN_COUNT = 0;


exports.parseBitcoinURI = function(url) {
  let r = /^bitcoin:([a-zA-Z0-9]{27,34})(?:\?(.*))?$/;
  let match = r.exec(url);
  if (!match) return null;

  let parsed = { url: url }

  if (match[2]) {
    let queries = match[2].split('&');
    for (let i = 0; i < queries.length; i++) {
      let query = queries[i].split('=');
      if (query.length == 2) {
        parsed[query[0]] = decodeURIComponent(query[1].replace(/\+/g, '%20'));
      }
    }
  }

  parsed.address = match[1];
  return parsed;
}

/**
 * Select coins from the 'coins' array, such that after verification (if required),
 * they sum to a value greater than or equal to the 'target'.
 *
 * On exit, a result Object is returned:
 * The result.selection array will contain Coin objects each with a 'value' and 'base64' element.
 * One or more Coins at the end of the selection list may include a 'targetValue' attribute that
 * may be used to determine if that Coin is to be used in a subsequent join/split in order to
 * attain the exact desired 'target' value.
 * The value of the final Coin having a 'targetValue' should be used to set the actual/verify target.
 *
 * @param target [Number] The target value of the coins to be selected.
 * @param coins [Array] The set of base64 encoded coins that are available for selection.
 * @param args [map] Optional arguments needed to support the selection process:
 *   issuerService [object]  An object containing the Issuer's fee information.
 *   outCoinCount [integer]  The number of new coins to be create, not including the target and change (if any).
 *   expiryPeriod_ms [integer]  The number of milliseconds before dropping the Issuer transaction.
 *   singleCoin [boolean]  Set to true if the caller is wanting a single coin of the target value.
 *
 * @return [Object]  A JSON object with the following elements:
 *   @element  targetValue [Number]  The value to be used when sending coins to /verify.
 *                     If 'targetValue' is anything other than a valid number, other elements may not be included.
 *                     Zero (0), if there are insufficient funds to satisfy the target value.
 *                     null if no coins were provided.
 *                     NaN if the target was not a number.
 *                     undefined if the process failed for any reason (e.g. no Issuer service supplied).
 *   @element singleCoin [boolean] True if the selection process is intended to create a single coin.
 *   @element faceValue [Number] The combined face value of all the coins returned.
 *   @element verifiedValue [Number] The combined value of all coins after verification of the coin(s) to be verified.
 *   @element toVerify [Array] A list of coins that should be verified in order to attain the target value.
 *   @element selection [Array] A list of coins that do not need to be verified.
 */
exports.coinSelection = function(target, coins, args) {
  //As this function can take a (very), long time
  //we want to record the duration at least during testing
  let startTime = new Date().getTime();

  //Activity: 'verify inputs' test case#0
  if(args.debug) console.log("Activity: 'verify inputs'");
  if(coins===null || coins.length==0) {
    _archiveCoinSelection("CS:00 coins null or empty", 0, startTime, 0, 0, {selection:[], toVerify:[]});
    return {targetValue:null};
  }

  if(typeof(target) != 'number') {
      if(typeof(target) == 'string') {
          target = Number.parseFloat(target);
          if(isNaN(target)) {
              _archiveCoinSelection("CS:01  "+target+" is NaN", 0, startTime, 0, 0, {selection:[],toVerify:[]});
//EXIT POINT ********
              return {targetValue:NaN}; // indicating the string sent wasn't a decimal number
          }
      } else {
          _archiveCoinSelection("CS:02 "+target+" is NaN", 0, startTime, 0, 0, {selection:[],toVerify:[]});
//EXIT POINT ********
          return {targetValue:NaN}; // indicating no value target was set
      }
  }

  if(target == 0) {
      _archiveCoinSelection("CS:03 target is zero", 0, startTime, 0, 0, {selection:[],toVerify:[]});
//EXIT POINT ********
      return {targetValue:undefined};
  }

  //ensure that args is defined and has a singleCoin element
  args = Object.assign({}, {singleCoin:false,debug:false,target:target,mustVerify:false}, _isPlainObject(args) ? args : {});

  //The inputs look good so let's get started.
  let wkCoins = new Array();//to hold the set of working coins
  let selection = new Array();//holds the set of coins that do not need to be split
  let realTarget = target;//needed because the target will be adjusted if there are pre-selected coins
  let defaultCandidate = null;//this will be set to a coin having the smallest value that's also larger than the target - if one exists
  let reducedTargetDefaultCandidate = null;
  let sum=0, x=0, y=0, i=0, ix=0; //housekeeping
  let totalNumberOfCoins = coins.length; //for reporting
  let ops=0;//for debug reporting

  //we need to have available the Issuer's fees.
  let issuer = null;
  if ("issuerService" in args) {
    issuer = args.issuerService;
  } else if("beginResponse" in args) {
    issuer = args.beginResponse.issuer[0];
  } else if("domain" in args) {
    issuer = getIssuerInfo(args.domain);
  } else if(_getSameDomain(coins) != null) {
    issuer = getIssuerInfo(_getSameDomain(coins));
  } else {
    issuer = getIssuerInfo(DEFAULT_ISSUER);
  }

  if (issuer === null || issuer === undefined) {
    console.log("No info found for Issuer");
//EXIT POINT ********
    _archiveCoinSelection("CS:04 no issuer", undefined, startTime, ops, totalNumberOfCoins, {selection:[],toVerify:[]});
    return {
      targetValue: undefined,
    };
  }

  args.issuerService = issuer; //make sure args has an issuerService defined
  let coinMinValue = Number.parseFloat(issuer.coinMinValue);

  if(args.debug) {
    console.log("WalletBF._coinSelection using issuerService",issuer);
  }

//Activity: 'prepare coin objects'
  if(args.debug) {
    console.log("Activity: 'prepare coin objects'");
  }

  let responseObj;
  for (i=0; i<coins.length; i++) {
    ops++;
    let el = coins[i];
    let coinObj = JSON.parse(atob(el)); //decode the base64 into an object
    coinObj.base64 = el; //include the original base64 encoding
    _setVerifiedValue(coinObj,args);

//Activity: 'single coin has exact value' TEST CASE#1
    if (args.mustVerify) {
      if (target == coinObj.verifiedValue) {
        //This coin happens to be the exact target value after verification
        responseObj =  {targetValue:target, selection:[], toVerify:[coinObj], singleCoin:args.singleCoin, faceValue:coinObj.value, verifiedValue:coinObj.verifiedValue};
        _archiveCoinSelection("CS:05.1 single verified coin has exact value", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
        WHOLE_COIN_COUNT += 1;
//EXIT POINT ********
        return responseObj;
      }
    } else {
      if (target == coinObj.value) {
        //This coin happens to be the exact target value we need
        responseObj =  {targetValue:target, selection:[coinObj], toVerify:[], singleCoin:args.singleCoin, faceValue:coinObj.value, verifiedValue:coinObj.verifiedValue};
        _archiveCoinSelection("CS:05 single coin has exact value", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
        WHOLE_COIN_COUNT += 1;
//EXIT POINT ********
        return responseObj;
      }
    }
    wkCoins.push(coinObj); //to build up the working set of coins
  }

  //We want to process the smallest valued coins first (hence pay the smallest fee)
  //Activity: 'sort coins by value'
  wkCoins.sort(function(a,b) {
    if(a.value > b.value) { return 1; }
    if(a.value < b.value) { return -1; }
    return 0;
  });

  let faceValue = _arraySum(wkCoins, "value", 0, wkCoins.length);
  let verificationFee = args.singleCoin ? _calcVerificationFee(faceValue, wkCoins.length, args) : {totalFee:0};
  let verifiedValue = round(faceValue - verificationFee.totalFee,8);

  //Activity: 'insufficient funds' TEST CASE#5_5
  if (target > faceValue) {
    if (args.debug) {
      console.log("Activity: 'insufficient funds'");
    }
    responseObj =  {targetValue:0, selection:[], toVerify:[], singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
    _archiveCoinSelection("CS:06 TC5_5 All coins having insufficient value for fee - multi-coin", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
    return responseObj;
  }
//???
//Activity: 'check equal or (almost)' TEST CASE#2
  if (!args.mustVerify && !args.singleCoin && wkCoins.length > 1) {
    if (faceValue >= target && target >= verifiedValue) {
      //this coin is so close we cannot do any better
      if (args.debug) {
        console.log("Activity: 'check equal or (almost)'");
      }
      responseObj = {
        targetValue: target,
        selection: wkCoins,
        toVerify: [],
        singleCoin: args.singleCoin,
        faceValue: faceValue,
        verifiedValue: verifiedValue
      };
      _archiveCoinSelection("CS:07 TC2,4 All coins equal or having insufficient value for fee - multi-coin", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
      return responseObj;
    }
  }

  if (args.debug) {
    console.log("### 1. working coins "+wkCoins.length, "sum", _arrayTotalValue(wkCoins, args), wkCoins);
  }

  let originalNumberOfCoins = wkCoins.length; //for reporting

  if (args.debug) {
    console.log("### 2. working coins "+wkCoins.length,wkCoins);
  }

//Activity: 'establish default single coin'
//Find the smallest single coin that can completely satisfy the target value after the fee is deducted
  let defaultCandidateIndex = wkCoins.findIndex(function(el) {
    if (el.verifiedValue >= target) {
      return true;
    }
  });

  if (args.debug) {
    console.log("defaultCandidateIndex is ",defaultCandidateIndex,(defaultCandidateIndex >= 0) ? wkCoins[defaultCandidateIndex] : {});
  }

  if (defaultCandidateIndex >= 0) {
    //This coin can satisfy the target on it's own and is the fallback choice if no other combination can reach the target
    defaultCandidate = wkCoins[defaultCandidateIndex];
    defaultCandidate.fallback = true;
    //The list of working coins (to be combined with each split candidate in turn), may also
    //be reduced by removing all coins that have a greater value than the target.
    wkCoins = wkCoins.slice(0, defaultCandidateIndex);

    if (wkCoins.length > 0) {
      faceValue = _arraySum(wkCoins, "value", 0, wkCoins.length);
      verificationFee = args.singleCoin ? _calcVerificationFee(faceValue, wkCoins.length, args) : {totalFee:wkCoins[0].fee};
      verifiedValue = round(faceValue - verificationFee.totalFee,8);
    } else {
      faceValue = 0;
      verifiedValue = 0;
    }
  }

  if (args.debug) {
    console.log("### 3. working coins "+wkCoins.length, wkCoins, "max. possible value", verifiedValue);
  }

  if(target > verifiedValue && defaultCandidate !== null) {
      //Activity: 'select defaultCandidate if sum wkCoins is insufficient - has default' TEST CASE#9
      if(args.debug) console.log("select defaultCandidate if sum wkCoins is insufficient");
      responseObj =  {targetValue:target, selection:[], toVerify:[defaultCandidate], singleCoin:args.singleCoin, faceValue:defaultCandidate.value, verifiedValue:defaultCandidate.verifiedValue};
      _archiveCoinSelection("CS:08 TC9 Default candidate selected", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
      return responseObj;
  }

  //For large numbers of coins searching ALL the possible combinations gets really expensive.
  //Better that we find a less perfect set of coins than having it blow up.

  //Some coins are not cost effective to split when used on their own but may be used in combination
  //as their combined value will not increase the minimum fee.
//Activity: 'consolidate small coins'
  let valueAttractingMinFee = round(((issuer.feeMin - issuer.feeFixed) / issuer.feeVariable),8);
  let joinCandidates = new Array();
  let joinCandidateSum = 0;
  while(wkCoins.length > 0 && (joinCandidateSum + wkCoins[0].value) <= valueAttractingMinFee) {
      joinCandidateSum += wkCoins[0].value;
      joinCandidates.push(wkCoins.shift());
  }
  joinCandidateSum = round(joinCandidateSum,8);

  if(args.debug) console.log("### 4. working coins "+wkCoins.length,wkCoins,joinCandidates.length,joinCandidates);

  //Now we need to know what the fee will be for verification of these joinCandidates
  let joinCandidateContribution = 0; //the contribution to the targetValue once fee has been deducted
  if(joinCandidates.length > 1) {
      let verifyAllCoins = true;
      joinCandidateContribution = _arrayTotalValue(joinCandidates, args, verifyAllCoins);
  } else if(joinCandidates.length === 1) {
      joinCandidateContribution = joinCandidates[0].verifiedValue;
  }

  if(args.debug) console.log("minFeeTarget",valueAttractingMinFee,"joinCandidateSum",joinCandidateSum,"joinCandidateContribution",joinCandidateContribution,"joinCandidates",joinCandidates);

//Activity: 'joinCandidate is sufficient' TEST CASE#11
  if(joinCandidateContribution >= target) {
      responseObj =  {targetValue:target, selection:[], toVerify:joinCandidates, singleCoin:args.singleCoin, faceValue:joinCandidateSum, verifiedValue:joinCandidateContribution};
      _archiveCoinSelection("CS:09 TC11 Join contribution candidate >= target", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
      return responseObj;
  }

  //The purpose of this step is to reduce the number of coins being considered by pre-selecting
  //the largest coins thereby including only the smaller coins that make up the balance.
  //For fewer than about 10 coins most systems will be able to cope with searching All possibilities.
//Activity: 'pre-select coins'
  let preSelectedCoinCount = 0;
  let preSelectedSum = 0; //holds the faceValue sum of all pre-selected coins
  while(wkCoins.length > COMBINATION_SEARCH) {
      let largestCoinIndex = wkCoins.length - 1;
      faceValue = round(preSelectedSum + wkCoins[largestCoinIndex].value,8);
      verificationFee = args.singleCoin ? _calcVerificationFee(faceValue, (++preSelectedCoinCount), args) : {totalFee:0};
      verifiedValue = round(faceValue - verificationFee.totalFee,8);
      if(args.debug) console.log("preSelectedSum",preSelectedSum,"wkCoins[largestCoinIndex].value", wkCoins[largestCoinIndex].value, "target",target);

      if(verifiedValue > target) break; //This may already be too large so no point in pre-selecting more coins

      let preSelectedCoin = wkCoins.pop();
      preSelectedCoin.preselected = true; //just to indicate how this was selected
      selection.push(preSelectedCoin);
      preSelectedSum = faceValue;
  }

  if(args.debug) console.log("### 5. working coins "+wkCoins.length,wkCoins);

  if(preSelectedSum > 0) { //adjust the target and possibly remove larger coins
      if(args.debug) console.log("preSelectedSum",preSelectedSum,"joinCandidateSum",joinCandidateSum, "total face value",preSelectedSum + joinCandidateSum);
      faceValue = round(preSelectedSum + joinCandidateSum,8);
      if(args.singleCoin) {
          verificationFee = _calcVerificationFee(faceValue, (joinCandidates.length +  selection.length), args);
      } else {
          verificationFee = _calcVerificationFee(joinCandidateSum, joinCandidates.length, args);
      }
      verifiedValue = round(faceValue - verificationFee.totalFee,8);

      if(args.debug) console.log("verifiedValue",verifiedValue,"verificationFee.totalFee",verificationFee.totalFee,"target",target);

      if(verifiedValue >= target) { //we may have a solution
//Activity: 'preselected + joinCandiates is sufficient' TEST CASE#14
          if(args.debug) console.log("preselected + joinCandiates is insufficient");

          let toVerify = args.singleCoin ? joinCandidates.concat(selection): joinCandidates;
          let tv = args.singleCoin ? target : round(target - preSelectedSum,8);

          if(tv >= coinMinValue) {
              responseObj =  {targetValue:tv, selection: args.singleCoin ? [] : selection, toVerify:toVerify, singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
              _archiveCoinSelection("CS:10 TC14 pre-selected + join candidates", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
              return responseObj;
          }
      }

//Activity: 'adjust target for pre-selected coins'
      target = round(target - preSelectedSum, 8);
if(args.debug) console.log("New target is ",target,"and joinCandidateContribution is ",joinCandidateContribution,"pre-selection",selection);

      //Having changed the target it's possible that wkCoins now contains one or more coins
      //that are larger than the new target. If so, these must to be removed and a new
      //reduced default set up.
      let index = wkCoins.findIndex(function(el) { return (el.verifiedValue >= target); });

      if(index >= 0) {
          reducedTargetDefaultCandidate = wkCoins[index];
          reducedTargetDefaultCandidate.fallback = true;
          wkCoins = wkCoins.slice(0, index);
      }
  }

  if(args.debug) console.log("### 6. working coins "+wkCoins.length,wkCoins,"originally coin length was "+originalNumberOfCoins);

  if(wkCoins.length == 0) {//Looks like the solution can come from the pre-selected coins
//Activity: 'working coins now empty'
      if(args.singleCoin) {
          let sum = _arrayTotalValue(selection, args); //pre-selected coins
          let reducedDefaultVerifiedValue = reducedTargetDefaultCandidate !== null ? reducedTargetDefaultCandidate.verifiedValue : 0;
          if((sum + reducedDefaultVerifiedValue) >= realTarget) {
              if(reducedDefaultVerifiedValue > 0) {
                  selection.push(reducedTargetDefaultCandidate);
              }
              faceValue = _arraySum(selection, "value", 0, selection.length);
              verificationFee = _calcVerificationFee(faceValue, selection.length, args);
              verifiedValue = round(faceValue - verificationFee.totalFee,8);
              responseObj =  {targetValue:realTarget, selection:[], toVerify:selection, singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
              _archiveCoinSelection("CS:12 TC15 Join candidate + reduced target - single coin", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
              return responseObj;
          }
      } else {
          let joinSum = _arraySum(joinCandidates, "value", 0, joinCandidates.length);
          verificationFee = _calcVerificationFee(joinSum, joinCandidates.length, args);
          let preSelectedSum = _arraySum(selection, "value", 0, selection.length);
          let tv = round(realTarget - preSelectedSum,8);
          if(tv > coinMinValue && tv < (joinSum - verificationFee.totalFee)) {
              faceValue = round(preSelectedSum + joinSum, 8);
              verifiedValue = round(faceValue - verificationFee.totalFee,8);
              responseObj =  {targetValue:tv, selection:selection, toVerify:joinCandidates, singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
              _archiveCoinSelection("CS:13 TC16 Join candidate + reduced target - multi coin", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
              return responseObj;
          } else {
              if(args.debug) console.log("Expected to obtain a solution from: target=",realTarget,"selection",selection,"joinCandidates",joinCandidates);
              if(args.debug) console.log("tv",tv,"coinMinValue",coinMinValue,"verified value",joinSum - verificationFee.totalFee);
          }
      }
  }

  //Now record the index in each coin so we can map coins back to the working list
  wkCoins.forEach(function(elt, ix) {
      elt.ix = ix;
  });

  //A function to sort a powerSet
  let pwrSort = function(a,b) {
      if(a.s < b.s) { return -1; }
      if(a.s > b.s) { return  1; }
      //When sum is the same select fewer coins first
      if(a.l.length < b.l.length) { return -1; }
      if(a.l.length > b.l.length) { return  1; }
      return 0;
  };

  //A function to select an exact match combination of coins
  let pwrSearch = function(element) {
      let val = round(target - element.s,8);
      if(val <= 0) {
          return false;
      }

      let matchedSet = _getBestCoin(pwr, {min:val,max:val});
      if(matchedSet == null || matchedSet.length == 0) {
          return false;
      }

      let exactMatch = matchedSet[0];

      for(i=0; i<exactMatch.l.length; i++) {
          selection.push(wkCoins[exactMatch.l[i]]);
      }
      return true;
  };

//THIS IS WHERE IT CAN GET EXPENSIVE SO HOPFULLY THE WORKING SET IS SMALL ENOUGH
//Activity: 'build the power set'
  let pwr = _powerSet(wkCoins);

//Step 6. Now sort the combinations of working coins in ascending order of their sum value
//Finds all combinations of the working set - this is 2^n so will fail for large numbers of coins
  pwr.sort(pwrSort);

//If there are join candidates they may individually (or in combination), combine with
//elements of the power set to offer a no-split solution
  let pwrJ = new Array();
  if(joinCandidates.length > 0) {
      pwrJ = _powerSet(joinCandidates);
      pwrJ.sort(pwrSort);
  }

  //We also need to check if the target can be reached without any join candidates
  pwrJ.push({"s":0,"l":[]}); //Causes the full target value (i.e. target - 0), to be checked at last.

//Activity: 'search for no-split solution' TEST CASE#5
  if(!args.singleCoin && pwr.length > 0) { //Look for combinations that don't require a split, hence no fee
      for(let j=0; j < pwrJ.length; j++)
      {
          let element = pwrJ[j];
          if(pwrSearch(element)) { //we have a hit
              for(let i=0; i < element.l.length; i++) {
                selection.push(joinCandidates[element.l[i]]);
              }
              faceValue = _arraySum(selection, "value", 0, selection.length);
              verificationFee = _calcVerificationFee(faceValue, selection.length, args);
              verifiedValue = round(faceValue - verificationFee.totalFee,8);
              responseObj =  {targetValue:realTarget, selection:selection, toVerify:[], singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
              _archiveCoinSelection("CS:14 TC5 Combination of whole coins", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
              WHOLE_COIN_COUNT += 1;
//EXIT POINT ********
              return responseObj;
          }
          // else continue with the next joinCandidates element
      }
  }

//Activity: 'pre-select join candidates'
  if(joinCandidateSum > 0) {
      //We couldn't use the joinCandidates as the split element but it's still a
      //good idea to pre-select them in case this whole selection is joined
      joinCandidates.forEach(function(elt) {
          elt.preselected = true;
          selection.push(elt);
      })

      //need to sort 'selection' because _arrayTotalValue needs to access the smallest coin
      selection.sort(function(a,b) {
          if(a.value > b.value) { return 1; }
          if(a.value < b.value) { return -1; }
          return 0;
      });

      target = round(target - joinCandidateSum, 8); //reduce the target by the join candidate sum
      if(args.debug) console.log("target is "+target+" after reducing joinCandidateSum which was "+joinCandidateSum,"selection",selection,"selection total value",_arrayTotalValue(selection, args));

      //Once again having reduced the target we may need to remove larger coins
      let index = wkCoins.findIndex(function(el) {
          if(el.verifiedValue > target) {
              return true;
          }
      });

      if(index >= 0) {
          reducedTargetDefaultCandidate = wkCoins[index];
          reducedTargetDefaultCandidate.fallback = true;
          wkCoins = wkCoins.slice(0, index);

          //Rebuild the power set for fewer coins
          pwr = _powerSet(wkCoins);
          pwr.sort(pwrSort);
      }
  }

  if(args.singleCoin) {
//Activity: 'establish min/max fees'
      let singleCoinMinFee = _calcVerificationFee(realTarget, selection.length + 1, args);
      //The plus one is because at least one more coin needs to be added

      let singleCoinMaxFee = 100; //Make the max fee massively large
      if(reducedTargetDefaultCandidate != null) {
          singleCoinMaxFee == reducedTargetDefaultCandidate.fee;
      } else if(defaultCandidate != null) {
          singleCoinMaxFee = defaultCandidate.fee;
      }
      if(singleCoinMinFee.totalFee >= singleCoinMaxFee) { //suggests the max fee will be applied so any combination will be fine
          singleCoinMaxFee = 100;//way over the max possible fee
      }

//Activity: 'search for combination' TEST CASE#10
      let j;
      let matchList = _getBestCoin(pwr, {min:(target + singleCoinMinFee.totalFee), max:(target + singleCoinMaxFee)});
      if(matchList != null) { //we may have a hit
          for(j=0; j<matchList.length; j++) {
              let wk = JSON.parse(JSON.stringify(selection)); //Deep copy of selection array
              let match = matchList[j];
              for(i=0; i<match.l.length; i++) {
                  wk.push(wkCoins[match.l[i]]);
              }
              faceValue = _arraySum(wk, "value", 0, wk.length);
              verificationFee = _calcVerificationFee(faceValue, wk.length, args);
              verifiedValue = round(faceValue - verificationFee.totalFee,8);
              if(verifiedValue >= realTarget) {
                  responseObj =  {targetValue:realTarget, selection:[], toVerify:wk, singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
                  _archiveCoinSelection("CS:15 TC10 singleCoin - combination of coins", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
                  return responseObj;
              }
          }
      }
  } else {
//Activity: 'establish unique split candidates'
      //Now remove duplicate candidate values because the fee will be the same
      let uniqueCandidate = _uniqueValues(wkCoins.slice(0, wkCoins.length));

      //The uniqueCandidate array now holds all viable coins that could be split to reach
      //the target value once they are combined with other coins.

//        if(self.config.debug) console.log("uniqueCandidate",uniqueCandidate,"wkCoins",wkCoins);

//Activity: 'search for combination with unique candidate' TEST CASE#11
      //Step 9. Now that the candidate list has been reduced to its minimal set of viable values,
      //process from smallest to largest combining with the other values, until all combinations have been checked.
      for(ix=0; ix < uniqueCandidate.length; ix++) {

          let candidateToSplit = uniqueCandidate[ix];
          //If the split candidate is used it's target must be as least coinMinValue
          let candidateTargetMin = target - (candidateToSplit.verifiedValue - coinMinValue);
          let candidateTargetMax = target;

//This time we are looking for combinations that don't include the candidateToSplit

          let matchList = _getBestCoin(pwr, {min:candidateTargetMin,max:candidateTargetMax}, candidateToSplit.ix);
          if(matchList != null) { //we may have a hit
              for(let j=0; j<matchList.length; j++) {
                  let match = matchList[j];
                  let wk = JSON.parse(JSON.stringify(selection)); //Deep copy of selection array
                  for(let i=0; i<match.l.length; i++) {
                      wk.push(wkCoins[match.l[i]]);
                  }
                  let sum = _arraySum(wk, "value", 0, wk.length);
                  let tv = round(realTarget - sum,8);
                  if(tv >= coinMinValue) {//Issuer will reject any target value smaller than minCoinValue
                      faceValue = round(sum + candidateToSplit.value,8);
                      verifiedValue = round(faceValue - candidateToSplit.fee,8);
                      if(verifiedValue >= realTarget) {
                          responseObj =  {targetValue:tv, selection:wk, toVerify:[candidateToSplit], singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
                          _archiveCoinSelection("CS:16 TC11 Combination with unique split candidate", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
                          return responseObj;
                      }
                  } else {
                      console.log("WARNING!! attempting to use targetValue of "+tv+" which is smaller than the minimum denomination of "+coinMinValue);
                  }
              }
          }
      } //end of unique candidates
  }

  if(args.debug) console.log("Fell through to check on reducedTargetDefaultCandidate ",reducedTargetDefaultCandidate);

  if(reducedTargetDefaultCandidate != null) {
//Activity: 'revert to reduced target default candidate - single coin' TEST CASE#7
      if(args.singleCoin) {
          selection.push(reducedTargetDefaultCandidate);
          faceValue = _arraySum(selection, "value", 0, selection.length);
          verificationFee = _calcVerificationFee(faceValue, selection.length, args);
          verifiedValue = round(faceValue - verificationFee.totalFee,8);
          if(verifiedValue >= realTarget) {
              responseObj =  {targetValue:realTarget, selection:[], toVerify:selection, singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
              _archiveCoinSelection("CS:17 TC7 Default reduced candidate selected", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
              return responseObj;
          }
      } else {
//Activity: 'revert to reduced target default candidate - multi coin' TEST CASE#8
          if(args.debug) console.log("Activity: 'revert to reduced target default candidate - multi coin' TEST CASE#8");
          let sum = _arraySum(selection, "value", 0, selection.length);
          let tv = round(realTarget - sum,8);
          verifiedValue = round(reducedTargetDefaultCandidate.verifiedValue + sum,8);
          if(tv >= coinMinValue && tv <= verifiedValue) {
              faceValue = round(reducedTargetDefaultCandidate.value + sum,8);
              responseObj =  {targetValue:tv, selection:selection, toVerify:[reducedTargetDefaultCandidate], singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
              _archiveCoinSelection("CS:18 TC8 Default reduced candidate selected", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
              return responseObj;
          }
      }
  }

  if(args.debug) console.log("Activity: 'revert to the default candidate' TEST CASE#3,4,6");
//Activity: 'revert to the default candidate' TEST CASE#3,4,6
  //Finally as no other combination has been able to satisfy the target,
  //we go back to the smallest single coin that is larger than the target
  if(defaultCandidate != null) {
      responseObj =  {targetValue:realTarget, selection:[], toVerify:[defaultCandidate], singleCoin:args.singleCoin, faceValue:defaultCandidate.value, verifiedValue:defaultCandidate.verifiedValue};
      _archiveCoinSelection("CS:19 TC3,4,6 Default candidate selected", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
      return responseObj;
  }

  //Apparently nothing is suitable but we know there are sufficient funds so use everything
  let allCoins = new Array();
  for(i=0; i<coins.length; i++)
  {
      let el = coins[i];
      let coinObj = JSON.parse(atob(el)); //decode the base64 into an object
      coinObj.base64 = el; //include the original base64 encoding
      _setVerifiedValue(coinObj,args);
      allCoins.push(coinObj);
  }
  if(args.debug) console.log("All coins",allCoins);

  if(args.singleCoin) {
//Activity: 'revert to all coins - single coin' TEST CASE#12
      faceValue = _arraySum(allCoins, "value", 0, allCoins.length);
      verificationFee = _calcVerificationFee(faceValue, allCoins.length, args);
      verifiedValue = round(faceValue - verificationFee.totalFee,8);
console.log(faceValue+"|"+verificationFee.totalFee+"|"+verifiedValue+"|"+realTarget);
      if(verifiedValue >= realTarget) {
          responseObj =  {targetValue:realTarget, selection:[], toVerify:allCoins, singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
          _archiveCoinSelection("CS:20 TC12 All coins", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
          return responseObj;
      }
  } else {
//Activity: 'revert to all coins - multi coin' TEST CASE#13
      allCoins.sort(function(a,b) {
          if(a.value > b.value) { return 1; }
          if(a.value < b.value) { return -1; }
          return 0;
      });

      faceValue = _arraySum(allCoins, "value", 0, allCoins.length);
      let tv = realTarget;//default to whole amount
      let coinToSplitIndex = allCoins.findIndex(function(element) {
          let remainder = faceValue - element.value;
          tv = round(realTarget - remainder,8);
          return (coinMinValue <= tv && tv <= element.verifiedValue); //looks like this coin can be split to the desired value
      });

      let coinToSplit = coinToSplitIndex >= 0 ? allCoins[coinToSplitIndex] : null;
      if(args.debug) console.log("coinToSplit",coinToSplit);
      selection.length = 0;
      allCoins.forEach(function(elt, i, array) {
          if(coinToSplitIndex != i) {
              selection.push(elt);
          }
      })

      verifiedValue = round((coinToSplit === null ? 0 : coinToSplit.verifiedValue) + _arraySum(selection, "value", 0, allCoins.length),8);
      responseObj =  {targetValue:tv, selection:selection, toVerify:coinToSplit === null ? [] : [coinToSplit], singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
      _archiveCoinSelection("CS:21 TC13 All coin", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
      return responseObj;
  }

  responseObj =  {targetValue:0, selection:[], toVerify:[], singleCoin:args.singleCoin, faceValue:faceValue, verifiedValue:verifiedValue};
  _archiveCoinSelection("CS:22 TC9 insufficient funds", responseObj.targetValue, startTime, ops, totalNumberOfCoins, responseObj);
//EXIT POINT ********
  return responseObj;
}


/**
 * Archive coin selection data for analysis.
 * @param description      [String]  A very brief description of the nature of the selection
 * @param target        [Number]  The original target value
 * @param startTime        [Integer]  The time in ms when the selection process started
 * @param cycles        [Integer]  A number to approximate the work that was done.
 * @param numberOfCoins      [Number]  The total number of coins held in the wallet at the time the coins were selected
 * @param coinSelectionResponse  [Object]  The result object returned from coinSelection.
 * 
 * @element  targetValue      [Number]  The target value to be sent to /verify
 * @element selection      [Array]    A list of Coins that are NOT to be verified
 * @element toVerify      [Array]    A list of Coins that should be verified
 * @element singleCoin      [Boolean]  True if the selection was intended for a single coin
 * @element faceValue      [Number]  The total face value of all coins selected
 * @element verifiedValue    [Number]  The expected value of all selected coins after coins have been verified.
 */
function _archiveCoinSelection(description, target, startTime, cycles, numberOfCoins, coinSelectionResponse) {
  let arch = new Object();
  arch.date = new Date().toISOString();
  arch.description = description;
  arch.target = target;
  arch.elapsedTime_ms = (new Date().getTime() - startTime);
  arch.cycles = cycles;
  arch.totalCoins = numberOfCoins;
  let str = "";
  let sep = "";
  let sum = 0;
  coinSelectionResponse.selection.forEach(function(elt, i, array) {
    sum += elt.value;
    str += (sep + elt.v);
    sep = ", ";
  });
  str += " [";
  coinSelectionResponse.toVerify.forEach(function(elt, i, array) {
    sum += elt.value;
    str += (sep + elt.v);
    sep = ", ";
  });
  str += "] (sum="+round(sum,8)+")";
  arch.selection = str;
  
  let coinSelection = JSON.parse(localStorage.getItem(COIN_SELECTION) || "[]"); 
  coinSelection.unshift(arch); // addFirst
  localStorage.setItem(COIN_SELECTION, JSON.stringify(coinSelection));

  let part = description.split(" ");
  console.log(arch.date+" | "+description+" | "+target+" | "+arch.elapsedTime_ms+"mS Cycles="+cycles+" for "+numberOfCoins+" coins.", coinSelectionResponse.selection,coinSelectionResponse.toVerify);
  if (part.length > 0) {
    let FNcount = JSON.parse(localStorage.getItem(COIN_SELECTION_FN)) || new Array();
    let fnIndex = FNcount.findIndex(function(elt) {
      return (elt.fn === part[0]);
    });
    if (fnIndex >= 0 ){
      FNcount[fnIndex].count = FNcount[fnIndex].count + 1;
    } else {
      FNcount.push({fn:part[0], count:1});
    }
    localStorage.setItem(COIN_SELECTION_FN, JSON.stringify(FNcount));
  }
}

/**
 * Sums 'n' 'item' elements of 'array' starting from element 'begin' modulus the length of the array.
 * @param array  [Array]    The array containing objects
 * @param item  [String]  The name of the element to be summed
 * @param begin  [integer]  The array index of the first element to be summed
 * @param n    [integer]  The number of elements to be summed
 */
function _arraySum(array, item, begin, n) {
  let sum=0, x=0;
  for(x=0; x < n; x++) {
    let ix = ((begin+x) % array.length);
    sum += array[ix][item];
  }
  return round(sum,8);
}

exports.round = function (number, precision) {
  let factor = Math.pow(10, precision);
  let tempNumber = number * factor;
  let roundedTempNumber = Math.round(tempNumber);
  return roundedTempNumber / factor;
}

function _isPlainObject(value) {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  } else {
    let prototype = Object.getPrototypeOf(value);
    return prototype === null || prototype === Object.prototype;
  }
}

/**
 * Iterates through an array of Coins (or base64 encoded coins),
 * and returns the common domain if they are all the same or null if not. 
 */
function _getSameDomain(list) {
  if (!Array.isArray(list)) {
    return null;
  }

  let domain = null;
  var some = list.some(function(el) {
    if (!_isPlainObject(el)) {
      el = Coin(el);
    }
    if (domain === null) domain = el.d;
    return (domain !== el.d);
  });

  if (!some) {
    return null;
  }
  return domain;
}

/**
 * A constructor for the Coin type which is obtained from a raw base64 string.
 * If includeFee is true, use the issuerInfo data (obtained through this coin's domain
 * or the issuerService specified in args), to add verifiedValue and fee to the Coin.
 * @param base64 An encoded coin string
 * @param includeFee (optional) If true add 'verifiedValue' and 'fee' to the Object
 * @param args (optional) The arguments that will be applied to calculate verification fees.
 * @return A Coin object
 */
function Coin(base64, includeFee, args, passphrase) {
  try {
    let obj = JSON.parse(atob(base64));  
    obj.base64 = base64;
    obj.value = round(parseFloat(obj.v), 8);

    if (includeFee) {
      let fees = _getVerificationFee(obj, args);
      obj.fee = round(fees.totalFee, 8);
      obj.verifiedValue = round(obj.value - obj.fee, 8);
    }
    return obj;
  } catch(err) {
    return null;
  }
}


/**
 * Calculate the verification fee for this (possibly pseudo) coin
 * when verified at this issuer, assuming numCoins are to be verified.
 * @param aCoin [object] A Coin object.
 * @param args [map] A map containing arguments needed to calculate the fee
 * 
 * issuerService [object] An object containing the Issuer's fee information.
 * inCoinCount [integer] The number of input coins to be processed.
 * outCoinCount [integer] The number of output coins requested.
 * 
 * @return a JSON object containing the "totalFee" and the "variableFee"
 */
function _getVerificationFee(aCoin, args) {
  if (!_isPlainObject(args)) {
    // If no specific issuer service is supplied then assume the coin's
    // own issuer will be used
    let issuer = getIssuerInfo(aCoin.d);
    if (issuer === null) {
      console.log("No Issuer info available for "+aCoin.d+", using default.");
    } else {
      args = {"issuerService": issuer};
    }
  } else if (!("issuerService" in args)) {
    if ("beginResponse" in args && "issuer" in args.beginResponse) {
      args.issuerService = args.beginResponse.issuer[0];
    } else {
      // If no specific issuer service is supplied then assume the
      // coin's own issuer will be used
      let domain = ("domain" in args) ? args.domain : aCoin.d;
      let issuer = getIssuerInfo(domain);
      if (issuer === null) {
        console.log("No Issuer info available for "+domain+", using default values.");
      } else {
        args.issuerService = issuer;
      }
    }
  }

  let defaults = {
    //If issuerService is not available, choose some 'reasonable' default values.
    issuerService :  {
      feeMax:      "0.00015000",
      feeMin:      "0.00000150",
      feeFixed:    "0.00000050",
      feeVariable:  "0.00750000",
      feeExpiry:    "0.00000010",
      feePerCoin:    "0.00000005",
      freeCoins:    "3"
    },
    inCoinCount: 1,
    outCoinCount: 1,
    expiryPeriod_ms: DEFAULT_EXPIRY_PERIOD
  };
  let localArgs = Object.assign({}, defaults, _isPlainObject(args) ? args : {});
  
  if (!("value" in aCoin)) {
    aCoin.value = round(Number.parseFloat(aCoin.v), 8);
  }

  return _calcVerificationFee(aCoin.value, localArgs.inCoinCount, localArgs);
}

/*
 * Given the value of a set of coins, the number of input coins and verification args,
 * calculate the Issuer's verification fee.
 * @param value [Number] The face value of the coins to be verified.
 * @param inCoinCount [Integer] The number of coins that make up the total value.
 * @param args [Object] A set of verification arguments that must include:
 * 
 * @param issuerService [Object] As returned by the Issuer service
 * @param outCoinCount [Integer] The number of extra coins to be generated by the Issuer.
 * @param expiryPeriod_ms [Integer] The time to hold the transaction open in milliseconds.
 * @param target [Number] The target value or undefined if no target set.
 * 
 * @return [Object] An object containing the 'variableFee' and the 'totalFee'.
 */
function _calcVerificationFee(value, inCoinCount, args) {
  let feeMax    = Number.parseFloat(args.issuerService.feeMax);
  let feeMin    = Number.parseFloat(args.issuerService.feeMin);
  let freeCoins  = ("freeCoins" in args.issuerService) ? Number.parseFloat(args.issuerService.freeCoins) : 3;

  let coinCount = (inCoinCount + args.outCoinCount + (typeof(args.target) == "number" ? 1 : 0) - freeCoins); //first three coins are processed for free
  //Cannot have a negative coin count
  let coinCountFee = (coinCount > 0) ? (coinCount * Number.parseFloat(args.issuerService.feePerCoin)) : 0;
  let expiryHours= Math.floor(Number.isInteger(args.expiryPeriod_ms) ? args.expiryPeriod_ms / (1000 * 60 * 60) : 0);
  let expiryFee = round(expiryHours * Number.parseFloat(args.issuerService.feeExpiry), 8);

  let expiryEmailFee = 0;
  if ("expiryEmail" in args && args.expiryEmail.length > 0) {
    expiryEmailFee= round(Number.parseFloat(args.issuerService.feeExpiryEmail), 8);
  }

  let variableFee  = round(value * Number.parseFloat(args.issuerService.feeVariable), 8);
  let naturalFee = variableFee + Number.parseFloat(args.issuerService.feeFixed);

  let totalFee = 0;
  if (naturalFee > feeMax) {
    totalFee = (feeMax + expiryFee + coinCountFee + expiryEmailFee);
  } else if ((naturalFee + expiryFee) < feeMin) {
    totalFee = (feeMin + coinCountFee + expiryEmailFee);
  } else {
    totalFee = (naturalFee + expiryFee + coinCountFee + expiryEmailFee);
  }
  
  return {
    variableFee: round(variableFee,8),
    totalFee: round(totalFee,8)
  };
}

function getIssuerInfo(name) {
  try {
    return ISSUERS[name];
  }
  catch(err) {
    return null;
  }
}

/**
 * Add the 'value', 'verifiedValue' and 'fee' as a Number to this coin (i.e. verifiedValue = faceValue - verificationFee).
 */
function _setVerifiedValue(coinObj, args) {

  let value = Number.parseFloat(coinObj.v);
  coinObj.value = round(value, 8);
  
  let fees = _getVerificationFee(coinObj,args);
  coinObj.fee = fees.totalFee;
  coinObj.verifiedValue = round(value - fees.totalFee, 8);
  coinObj.variableFee = fees.variableFee;
  coinObj.variableValue = round(value - fees.variableFee, 8); 
}

/**
 * This function returns the best possible totalValue of the coins in the list assuming the list is verified in some way.
 * When args has singleCoin set, the result will be the actual contributing value
 * otherwise the actual totalValue may be less than this function returns because higher valued coin(s) may be verified.
 * @param arr [Array] A list of coins
 * @param args[Object] A JSON object containing attributes of a verification
 * @param verifyAllCoins [boolean] If defined, always assume all coins will be verified
 * @return The sum of the array values
 */
function _arrayTotalValue(arr, args, verifyAllCoins) {

  if (arr.length == 0) return 0;
  let sum = _arraySum(arr, "value", 0, arr.length);

  let defaults = {
    inCoinCount: arr.length
  };
  let localArgs = Object.assign({}, defaults, _isPlainObject(args) ? args : {});

  if (!("issuerService" in localArgs)) {
    if ("beginResponse" in localArgs && "issuer" in localArgs.beginResponse) {
      localArgs.issuerService = localArgs.beginResponse.issuer[0];
    }
  }
  
  if (typeof(verifyAllCoins) !== "undefined")
  {
    localArgs.singleCoin = localArgs.singleCoin || verifyAllCoins;
  }
  
  //The fee will differ depending on the setting of verifyAllCoins/singleCoin.
  //If singleCoin or verifyAllCoins is set then fee is calculated on the sum,
  //otherwise it's calculated on the first coin in the list
  let coin = {
    value: localArgs.singleCoin ? sum : arr[0].value
  };
  let fees = _getVerificationFee(coin, localArgs);
  
  return round(sum - fees.totalFee,8);
}

function _powerSet(coins) {

  let tm = Date.now();  
  let l = coins.length;
  let list = Array(l);
  while(l--) list[l] = l;

  let set = [],
      listSize = list.length,
      combinationsCount = (1 << listSize),
      combination;

  for (let i = 1; i < combinationsCount ; i++ ) {
    let combination = [];
    for (let j=0;j<listSize;j++){
      if ((i & (1 << j))){
        combination.push(list[j]);
      }
    }
    let sum = _sumCoinValue(coins, combination);
    set.push({
      "s": sum,
      "l": combination
    });
  }
  console.log("Built powerSet["+set.length+"] in "+(Date.now() - tm)+"ms", set);
  return set;
}

function _sumCoinValue(src, arr) {
  let sum=0, x=0, l = arr.length;
  for(x=0; x<l; x++) {
    sum += src[arr[x]].value;
  }
  return round(sum,8);
}

/**
 * Return a list of CoinSet from the list who's sum value is at least equal to target.min and is not larger than target.max.
 * @param list      [Array]    A list of CoinSet objects sorted by their sum in ascending order.
 * @param target    [Object]  The target range containing min and max elements.
 * @param ignoreIndex  [integer]  (Optional) The index of a Coin that must not be included in the set.
 * 
 * @return        [Array]    Return an array of elements from the list in order of their element.s value (i.e their sum value).
 * Returned elements will be such that target.min <= element.s <= target.max.
 * If target.min is NOT positive or if target.max < target.min, return null.
 */
function _getBestCoin(list, target, ignoreIndex) {

  if (target == null || target.min <= 0 || target.min > target.max) return null; 
  let ignore = (typeof(ignoreIndex) === 'number') ? (function(elt) { return (elt.l.indexOf(ignoreIndex) !== -1); }) : (function(elt) { return false; });
  
//TODO replace with a binary search - but actually don't think I can?
  let index = list.findIndex(function(elt) {
    return (!ignore(elt) && elt.s >= target.min && elt.s <= target.max);
  });
  
  let result = new Array();

  while(index >= 0) {
    result.push(list[index++]);

    if (index == list.length || list[index].s < target.min || list[index].s > target.max) {
      index = -1;
    }
  }

  return result;
}


//This function takes an array of Coin objects and returns an array containing
//coins with only unique values (i.e. all duplicate values removed).
function _uniqueValues(coins) {
  let seen = {};
  return coins.filter(function(item) {
    if (!_isPlainObject(item)) {
      return false;
    }
    let elt = "value" in item ? item.value.toString() : Number(item.v).toString();
    return seen.hasOwnProperty(elt) ? false : (seen[elt] = true);
  });
}

